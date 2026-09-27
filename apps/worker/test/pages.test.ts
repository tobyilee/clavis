import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

let editor: { bearer: string };
let viewer: { bearer: string };

async function space(key = 'PAY', name = '결제') {
  const res = await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key, name } });
  expect(res.status).toBe(201);
  return res.json;
}

async function page(title: string, body = '', opts: Record<string, unknown> = {}, key = 'PAY') {
  const res = await call(`/api/v1/spaces/${key}/pages`, {
    ...editor,
    method: 'POST',
    body: { title, content: `${FM()}${body}`, ...opts },
  });
  if (res.status !== 201)
    throw new Error(`create ${title}: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.page;
}

beforeEach(async () => {
  await resetDb();
  editor = await agentWithRole('editor');
  viewer = await agentWithRole('viewer');
});

describe('spaces', () => {
  it('creates a space with a home page (D-35); only admins may', async () => {
    const created = await space();
    expect(created).toMatchObject({ key: 'PAY', name: '결제', archivedAt: null });
    expect(created.homePageShortId).toMatch(/^[0-9a-z]{6}$/);

    const home = await call(`/api/v1/pages/${created.homePageShortId}`, viewer);
    expect(home.json).toMatchObject({ title: '결제', docType: 'note', spaceKey: 'PAY' });

    const denied = await call('/api/v1/spaces', {
      ...editor,
      method: 'POST',
      body: { key: 'ARCH', name: 'x' },
    });
    expect(denied.status).toBe(403);
    const dup = await call('/api/v1/spaces', {
      ...ADMIN,
      method: 'POST',
      body: { key: 'pay', name: 'y' },
    });
    expect(dup.status).toBe(409);
    const bad = await call('/api/v1/spaces', {
      ...ADMIN,
      method: 'POST',
      body: { key: '1X', name: 'y' },
    });
    expect(bad.status).toBe(400);
  });

  it('archives a space: hidden, read-only, restorable (D-34)', async () => {
    await space();
    await page('설계');
    expect((await call('/api/v1/spaces/PAY', { ...ADMIN, method: 'DELETE' })).status).toBe(200);
    expect((await call('/api/v1/spaces', viewer)).json.spaces).toEqual([]);
    expect(
      (await call('/api/v1/spaces?includeArchived=true', viewer)).json.spaces[0].archivedAt,
    ).toBeTypeOf('number');
    const write = await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: 'x' },
    });
    expect(write.status).toBe(409);
    expect(write.json.type).toMatch(/space-archived$/);

    await call('/api/v1/spaces/PAY', { ...ADMIN, method: 'PATCH', body: { archived: false } });
    expect((await call('/api/v1/spaces', viewer)).json.spaces).toHaveLength(1);
  });
});

describe('page lifecycle', () => {
  beforeEach(() => space());

  it('creates from a template, lint-clean, attributed to the agent', async () => {
    const res = await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: '결제 API 설계', template: 'spec' },
    });
    expect(res.status).toBe(201);
    expect(res.json.violations).toEqual([]);
    expect(res.json.page).toMatchObject({
      title: '결제 API 설계',
      slug: '결제-api-설계',
      docType: 'spec',
      status: 'draft',
      revision: 1,
      updatedBy: { name: 'bot-editor', kind: 'agent' },
      ancestors: [],
    });
    expect(res.json.page.content).toContain('## 미결 사항');
  });

  it('rejects lint errors with 422 and saves nothing', async () => {
    const res = await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: 'x', content: '## no frontmatter\n' },
    });
    expect(res.status).toBe(422);
    expect(res.type).toContain('application/problem+json');
    expect(res.json.violations[0]).toMatchObject({ ruleId: 'clavis/frontmatter-required' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM pages').first('n')).toBe(1);
  });

  it('returns warnings on success, and 413 over 100KB', async () => {
    const res = await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: 'w', content: `${FM()}# H1\n` },
    });
    expect(res.status).toBe(201);
    expect(res.json.violations.map((v: { ruleId: string }) => v.ruleId)).toEqual(['clavis/no-h1']);

    const big = await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: 'big', content: FM() + 'x'.repeat(110_000) },
    });
    expect(big.status).toBe(413);
  });

  it('forbids viewers from writing', async () => {
    const res = await call('/api/v1/spaces/PAY/pages', {
      ...viewer,
      method: 'POST',
      body: { title: 'x' },
    });
    expect(res.status).toBe(403);
  });

  it('keeps titles unique per space', async () => {
    await page('설계');
    const dup = await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: '설계' },
    });
    expect(dup.status).toBe(409);
    expect(dup.json.type).toMatch(/title-taken$/);
  });

  it('updates with optimistic locking', async () => {
    const p = await page('설계', '## 개요\n');
    const ok = await call(`/api/v1/pages/${p.shortId}`, {
      ...editor,
      method: 'PUT',
      body: { content: `${FM('note', 'review')}## 개요\n수정\n`, baseRevision: 1 },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.page).toMatchObject({ revision: 2, status: 'review' });

    const stale = await call(`/api/v1/pages/${p.id}`, {
      ...editor,
      method: 'PUT',
      body: { content: `${FM()}늦은 수정\n`, baseRevision: 1 },
    });
    expect(stale.status).toBe(409);
    expect(stale.json).toMatchObject({ revision: 2 });
    expect((await call(`/api/v1/pages/${p.id}`, viewer)).json.content).toContain('수정');
  });

  it('rolls back a save that loses the race inside the write batch', async () => {
    const p = await page('설계');
    // Simulate a concurrent save landing between our read and write batches.
    await env.DB.prepare('UPDATE pages SET revision = 5 WHERE id = ?').bind(p.id).run();
    const res = await call(`/api/v1/pages/${p.id}`, {
      ...editor,
      method: 'PUT',
      body: { content: `${FM()}---\n`, baseRevision: 5, title: '새 제목' },
    });
    expect(res.status).toBe(200);
    const stale = await call(`/api/v1/pages/${p.id}`, {
      ...editor,
      method: 'PUT',
      body: { content: `${FM()}x\n`, baseRevision: 5 },
    });
    expect(stale.status).toBe(409);
    expect(stale.json.revision).toBe(6);
  });

  it('serves raw Markdown and finds pages by title', async () => {
    const p = await page('결제 API', '## 개요\n');
    const md = await call(`/api/v1/pages/${p.shortId}`, {
      ...viewer,
      headers: { accept: 'text/markdown' },
    });
    expect(md.type).toContain('text/markdown');
    expect(md.json.raw).toBe(`${FM()}## 개요\n`);

    const byTitle = await call(
      `/api/v1/pages/by-title?space=pay&title=${encodeURIComponent('결제 API')}`,
      viewer,
    );
    expect(byTitle.json.shortId).toBe(p.shortId);
    const byRef = await call(`/api/v1/pages/${encodeURIComponent('PAY:결제 API')}`, viewer);
    expect(byRef.json.id).toBe(p.id);
  });
});

describe('wiki links', () => {
  beforeEach(() => space());

  const linkOf = (id: string) =>
    env.DB.prepare('SELECT target_title, to_page_id FROM page_links WHERE from_page_id = ?')
      .bind(id)
      .all();

  it('reconnects links when the target appears, breaks them on rename (D-42)', async () => {
    const a = await page('안내', '[[정책]] [[PAY:정책]]\n');
    expect(a).toBeTruthy();
    const created = await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: 'x', content: `${FM()}[[정책]]\n` },
    });
    expect(created.json.violations[0]).toMatchObject({ ruleId: 'clavis/wiki-link-exists' });

    const target = await page('정책');
    expect((await linkOf(a.id)).results).toEqual([{ target_title: '정책', to_page_id: target.id }]);

    const renamed = await call(`/api/v1/pages/${target.id}`, {
      ...editor,
      method: 'PUT',
      body: { title: '환불 정책', content: FM(), baseRevision: 1 },
    });
    expect(renamed.json.linksToOldTitle).toBe(2);
    expect((await linkOf(a.id)).results).toEqual([{ target_title: '정책', to_page_id: null }]);
  });
});

describe('tree, move, trash', () => {
  beforeEach(() => space());

  it('serves the tree with an ETag and 304', async () => {
    const a = await page('A');
    await page('A1', '', { parent: a.shortId });
    const first = await call('/api/v1/spaces/pay/tree', viewer);
    expect(first.json.tree.map((n: { title: string }) => n.title)).toEqual(['결제', 'A']);
    expect(first.json.tree[1].children[0].title).toBe('A1');

    const etag = `W/"tree-PAY-${first.json.treeVersion}"`;
    const again = await call('/api/v1/spaces/PAY/tree', {
      ...viewer,
      headers: { 'if-none-match': etag },
    });
    expect(again.status).toBe(304);
    await page('B');
    const changed = await call('/api/v1/spaces/PAY/tree', {
      ...viewer,
      headers: { 'if-none-match': etag },
    });
    expect(changed.status).toBe(200);
  });

  it('reorders and reparents, but never under its own subtree', async () => {
    const a = await page('A');
    const b = await page('B');
    const c = await page('C', '', { parent: a.id });
    const titles = async () =>
      (await call('/api/v1/spaces/PAY/tree', viewer)).json.tree.map(
        (n: { title: string }) => n.title,
      );

    await call(`/api/v1/pages/${b.id}/move`, {
      ...editor,
      method: 'POST',
      body: { before: a.shortId },
    });
    expect(await titles()).toEqual(['결제', 'B', 'A']);

    const bad = await call(`/api/v1/pages/${a.id}/move`, {
      ...editor,
      method: 'POST',
      body: { parent: c.id },
    });
    expect(bad.status).toBe(400);

    const moved = await call(`/api/v1/pages/${c.id}/move`, {
      ...editor,
      method: 'POST',
      body: { parent: null },
    });
    expect(moved.json).toMatchObject({ parentId: null, revision: 1 });
    expect(await titles()).toEqual(['결제', 'B', 'A', 'C']);

    const nested = await call(`/api/v1/pages/${c.id}/move`, {
      ...editor,
      method: 'POST',
      body: { parent: b.id },
    });
    expect(nested.json.ancestors.map((x: { title: string }) => x.title)).toEqual(['B']);
  });

  it('trashes a subtree and restores it, renaming taken titles', async () => {
    const a = await page('A');
    await page('A1', '', { parent: a.id });
    const link = await page('링크', '[[A1]]\n');
    const del = await call(`/api/v1/pages/${a.id}`, { ...editor, method: 'DELETE' });
    expect(del.json.pageCount).toBe(2);
    expect((await call(`/api/v1/pages/${a.id}`, viewer)).status).toBe(404);
    expect(
      await env.DB.prepare('SELECT to_page_id FROM page_links WHERE from_page_id = ?')
        .bind(link.id)
        .first('to_page_id'),
    ).toBeNull();

    const listed = await call('/api/v1/trash?space=PAY', viewer);
    expect(listed.json.entries).toEqual([
      expect.objectContaining({
        batchId: del.json.batchId,
        pageCount: 2,
        root: expect.objectContaining({ title: 'A' }),
        deletedBy: expect.objectContaining({ name: 'bot-editor' }),
      }),
    ]);

    await page('A'); // takes the title while the original is in the trash
    const restored = await call(`/api/v1/trash/${del.json.batchId}/restore`, {
      ...editor,
      method: 'POST',
    });
    expect(restored.json).toMatchObject({
      restored: 2,
      renamed: [{ id: a.id, title: 'A (restored)' }],
    });
    expect((await call(`/api/v1/pages/${a.id}`, viewer)).json.title).toBe('A (restored)');
    expect(
      await env.DB.prepare('SELECT to_page_id FROM page_links WHERE from_page_id = ?')
        .bind(link.id)
        .first('to_page_id'),
    ).not.toBeNull();
    expect((await call('/api/v1/trash', viewer)).json.entries).toEqual([]);
  });

  it('restores a child to the top level when its parent is still trashed', async () => {
    const a = await page('A');
    const a1 = await page('A1', '', { parent: a.id });
    const d1 = await call(`/api/v1/pages/${a1.id}`, { ...editor, method: 'DELETE' });
    await call(`/api/v1/pages/${a.id}`, { ...editor, method: 'DELETE' });
    await call(`/api/v1/trash/${d1.json.batchId}/restore`, { ...editor, method: 'POST' });
    expect((await call(`/api/v1/pages/${a1.id}`, viewer)).json.parentId).toBeNull();
  });

  it('protects the space home page', async () => {
    const s = (await call('/api/v1/spaces/PAY', viewer)).json;
    const res = await call(`/api/v1/pages/${s.homePageShortId}`, { ...editor, method: 'DELETE' });
    expect(res.status).toBe(409);
  });
});

describe('search, lint, templates', () => {
  beforeEach(async () => {
    await space();
    await page('결제 API 설계', 'PG사 연동은 비동기로 처리한다.\n', {}, 'PAY');
    await page('환불 정책', '결제 후 7일 이내 환불.\n', {}, 'PAY');
  });

  it('searches with trigram FTS and falls back to LIKE for short terms', async () => {
    const fts = await call(`/api/v1/search?q=${encodeURIComponent('비동기')}`, viewer);
    expect(fts.json.hits.map((h: { title: string }) => h.title)).toEqual(['결제 API 설계']);
    expect(fts.json.hits[0].snippet).toContain('비동기');

    const short = await call(`/api/v1/search?q=${encodeURIComponent('결제')}`, viewer);
    // The space home page is titled '결제' too.
    expect(short.json.hits.map((h: { title: string }) => h.title).sort()).toEqual([
      '결제',
      '결제 API 설계',
      '환불 정책',
    ]);
    // Title matches rank first in LIKE mode.
    expect(short.json.hits.at(-1).title).toBe('환불 정책');

    const filtered = await call(`/api/v1/search?q=${encodeURIComponent('결제')}&type=spec`, viewer);
    expect(filtered.json.hits).toEqual([]);
    const syntax = await call(`/api/v1/search?q=${encodeURIComponent('AND OR "(')}`, viewer);
    expect(syntax.status).toBe(200);
  });

  it('paginates with a cursor', async () => {
    const first = await call(`/api/v1/search?q=${encodeURIComponent('결제')}&limit=1`, viewer);
    expect(first.json.hits).toHaveLength(1);
    const next = await call(
      `/api/v1/search?q=${encodeURIComponent('결제')}&limit=1&cursor=${first.json.nextCursor}`,
      viewer,
    );
    expect(next.json.hits[0].id).not.toBe(first.json.hits[0].id);
  });

  it('lints without saving', async () => {
    const res = await call('/api/v1/lint', {
      ...viewer,
      method: 'POST',
      body: { content: `${FM('adr')}[[없는 문서]] [[환불 정책]]\n`, space: 'PAY' },
    });
    expect(res.json.violations.map((v: { ruleId: string }) => v.ruleId).sort()).toEqual([
      'clavis/required-sections',
      'clavis/required-sections',
      'clavis/required-sections',
      'clavis/wiki-link-exists',
    ]);
  });

  it('lists templates in the requested language', async () => {
    const res = await call('/api/v1/templates?locale=en', viewer);
    const adr = res.json.templates.find((t: { type: string }) => t.type === 'adr');
    expect(adr.requiredSections).toEqual(['Context', 'Decision', 'Consequences']);
    expect(adr.content).toContain('type: adr');
  });
});

describe('api docs', () => {
  it('documents every route in openapi.json', async () => {
    const spec = await call('/api/v1/openapi.json');
    const paths = Object.keys(spec.json.paths);
    for (const p of [
      '/spaces',
      '/spaces/{key}/tree',
      '/pages/{ref}',
      '/pages/{ref}/move',
      '/trash',
      '/search',
      '/lint',
      '/templates',
    ]) {
      expect(paths).toContain(p);
    }
    const html = await call('/api/v1/docs');
    expect(html.status).toBe(200);
  });
});

describe('trash purge (D-36)', () => {
  it('permanently deletes pages trashed over 30 days ago, with their attachments', async () => {
    const { purgeTrash, TRASH_RETENTION_MS } = await import('../src/services/trash');
    await space();
    const old = await page('오래됨', '[[남음]]\n');
    const kept = await page('남음', '[[오래됨]]\n');
    await env.DB.prepare(
      `INSERT INTO attachments (id, page_id, filename, r2_key, mime_type, size_bytes, created_by, created_at)
       SELECT 'att1', ?, 'a.png', 'att/x/att1', 'image/png', 1, created_by, 0 FROM pages WHERE id = ?`,
    )
      .bind(old.id, old.id)
      .run();
    await env.FILES.put('att/x/att1', 'png');
    await call(`/api/v1/pages/${old.id}`, { ...editor, method: 'DELETE' });

    const now = Date.now();
    expect(await purgeTrash(env.DB, env.FILES, now)).toBe(0);
    expect(await purgeTrash(env.DB, env.FILES, now + TRASH_RETENTION_MS + 1)).toBe(1);
    expect(
      await env.DB.prepare('SELECT COUNT(*) AS n FROM pages WHERE id = ?').bind(old.id).first('n'),
    ).toBe(0);
    expect(await env.FILES.get('att/x/att1')).toBeNull();
    expect(
      await env.DB.prepare('SELECT to_page_id FROM page_links WHERE from_page_id = ?')
        .bind(kept.id)
        .first('to_page_id'),
    ).toBeNull();
    expect((await call('/api/v1/trash', viewer)).json.entries).toEqual([]);
  });
});
