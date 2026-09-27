import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { RECENT_VIEWS_KEPT, recordView } from '../src/services/home';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

let editor: { bearer: string };
const ME = { as: 'owner@gmail.com' };

async function page(title: string, body = '', key = 'PAY') {
  const res = await call(`/api/v1/spaces/${key}/pages`, {
    ...editor,
    method: 'POST',
    body: { title, content: `${FM()}${body}` },
  });
  if (res.status !== 201) throw new Error(`create ${title}: ${res.status}`);
  return res.json.page;
}
const home = async () => (await call('/api/v1/me/home', ME)).json;
const titles = (list: { title: string }[]) => list.map((p) => p.title);

beforeEach(async () => {
  await resetDb();
  editor = await agentWithRole('editor', 'hermes');
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
});

describe('favorites (P1)', () => {
  it('stars and unstars pages, idempotently, hiding trashed ones', async () => {
    const a = await page('정책');
    const b = await page('안내');
    for (const p of [a, b, a]) {
      expect((await call(`/api/v1/pages/${p.id}/favorite`, { ...ME, method: 'PUT' })).status).toBe(
        204,
      );
    }
    expect(titles((await call('/api/v1/me/favorites', ME)).json.favorites)).toEqual([
      '안내',
      '정책',
    ]);
    await call(`/api/v1/pages/${b.id}/favorite`, { ...ME, method: 'DELETE' });
    await call(`/api/v1/pages/${a.id}`, { ...editor, method: 'DELETE' });
    expect((await call('/api/v1/me/favorites', ME)).json.favorites).toEqual([]);
    expect((await call('/api/v1/pages/nope00/favorite', { ...ME, method: 'PUT' })).status).toBe(
      404,
    );
  });
});

describe('recently viewed (D-50)', () => {
  it('records people, not agents, newest first', async () => {
    const a = await page('정책');
    const b = await page('안내');
    await call(`/api/v1/pages/${a.shortId}`, ME);
    await call(`/api/v1/pages/${b.shortId}`, ME);
    await call(`/api/v1/pages/${a.shortId}`, ME);
    await call(`/api/v1/pages/${b.shortId}`, editor);
    expect(titles((await home()).recentViews)).toEqual(['정책', '안내']);
    const agentViews = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM page_views v JOIN actors a ON a.id = v.actor_id WHERE a.kind = 'agent'",
    ).first<{ n: number }>();
    expect(agentViews?.n).toBe(0);
  });

  it(`keeps only the newest ${RECENT_VIEWS_KEPT} per person`, async () => {
    await call('/api/v1/me', ME);
    const me = await env.DB.prepare("SELECT id FROM actors WHERE email = 'owner@gmail.com'").first<{
      id: string;
    }>();
    const home0 = await page('시작');
    // Many views in bulk: one real row per page is needed for the join, so reuse ids.
    const ids = [home0.id];
    for (let i = 0; i < RECENT_VIEWS_KEPT + 5; i++) ids.push((await page(`p${i}`)).id);
    for (const [i, id] of ids.entries()) await recordView(env.DB, me?.id ?? '', id, 1000 + i);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM page_views').first<{ n: number }>();
    expect(n?.n).toBe(RECENT_VIEWS_KEPT);
    const oldest = await env.DB.prepare('SELECT 1 FROM page_views WHERE page_id = ?')
      .bind(home0.id)
      .first();
    expect(oldest).toBeNull();
  });
});

describe('home (P3)', () => {
  it('lists recent changes with their authors and my pages with open comments', async () => {
    const mine = await page('내 문서');
    await page('다른 문서');
    await call(`/api/v1/pages/${mine.id}/comments`, {
      ...editor,
      method: 'POST',
      body: { body: '질문 1' },
    });
    await call(`/api/v1/pages/${mine.id}/comments`, {
      ...editor,
      method: 'POST',
      body: { body: '질문 2' },
    });
    const h = await home();
    expect(titles(h.recentChanges).slice(0, 2)).toEqual(['다른 문서', '내 문서']);
    expect(h.recentChanges[0].updatedBy).toMatchObject({ name: 'hermes', kind: 'agent' });
    // FM() makes owner@gmail.com the owner of every test page.
    expect(h.openComments).toEqual([
      expect.objectContaining({ title: '내 문서', openThreads: 2, at: expect.any(Number) }),
    ]);
  });
});

describe('raw views for AI tools (D-51)', () => {
  it('serves a page as Markdown at its URL plus .md', async () => {
    const p = await page('결제 정책', '본문\n');
    const res = await call(`/s/PAY/p/${encodeURI(`${p.slug}-${p.shortId}`)}.md`, ME);
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/markdown; charset=utf-8');
    expect(res.text).toBe(`${FM()}본문\n`);
    expect(res.headers.get('x-clavis-revision')).toBe('1');
    // Any slug works (D-08); the space must match.
    expect((await call(`/s/PAY/p/x-${p.shortId}.md`, ME)).status).toBe(200);
    expect((await call(`/s/ARCH/p/x-${p.shortId}.md`, ME)).status).toBe(404);
    expect((await call(`/s/PAY/p/x-${p.shortId}.md`)).status).toBe(401);
  });

  it('indexes the wiki and each space in llms.txt', async () => {
    const parent = await page('설계');
    await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: 'API', content: FM('spec'), parent: parent.id },
    });
    const root = await call('/llms.txt', ME);
    expect(root.text).toContain('- [결제 (PAY)](https://clavis.test/s/PAY/llms.txt)');
    const space = await call('/s/pay/llms.txt', ME);
    expect(space.type).toBe('text/plain; charset=utf-8');
    expect(space.text).toMatch(/^# 결제 \(PAY\)\n/);
    expect(space.text).toMatch(
      /\n- \[설계\]\(https:\/\/clavis\.test\/s\/PAY\/p\/%EC%84%A4%EA%B3%84-\w{6}\.md\): note, draft\n {2}- \[API\]\(https:\/\/clavis\.test\/s\/PAY\/p\/api-\w{6}\.md\): spec, draft\n/,
    );
  });
});
