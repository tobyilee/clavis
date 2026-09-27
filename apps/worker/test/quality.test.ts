import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { RECHECK_BYTES, recheckSpace } from '../src/services/quality';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

let editor: { bearer: string };
let viewer: { bearer: string };

async function page(title: string, body = '', key = 'PAY', type = 'note') {
  const res = await call(`/api/v1/spaces/${key}/pages`, {
    ...editor,
    method: 'POST',
    body: { title, content: `${FM(type)}${body}` },
  });
  if (res.status !== 201) throw new Error(`create ${title}: ${res.status}`);
  return res.json.page;
}

const health = async (key = 'PAY') => (await call(`/api/v1/spaces/${key}/health`, viewer)).json;
const recheck = async (key = 'PAY') =>
  (await call(`/api/v1/spaces/${key}/lint/recheck`, { ...viewer, method: 'POST' })).json;

beforeEach(async () => {
  await resetDb();
  editor = await agentWithRole('editor');
  viewer = await agentWithRole('viewer');
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
});

describe('backlinks', () => {
  it('lists live linking pages from every space, once each', async () => {
    await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'ARCH', name: 'A' } });
    const target = await page('정책');
    await page('안내', '[[정책]] 그리고 [[정책|다시]]\n');
    await page('원칙', '[[PAY:정책]]\n', 'ARCH');
    await page('자기', '');
    const gone = await page('지울 문서', '[[정책]]\n');
    await call(`/api/v1/pages/${gone.id}`, { ...editor, method: 'DELETE' });

    const res = await call(`/api/v1/pages/${target.shortId}/backlinks`, viewer);
    expect(res.status).toBe(200);
    expect(
      res.json.backlinks.map(
        (b: { spaceKey: string; title: string }) => `${b.spaceKey}:${b.title}`,
      ),
    ).toEqual(['ARCH:원칙', 'PAY:안내']);
    expect((await call('/api/v1/pages/nope00/backlinks', viewer)).status).toBe(404);
  });
});

describe('space health (D-46)', () => {
  it('stores a summary on save and reports pages, rules and broken links', async () => {
    await page('깔끔', '본문\n');
    const messy = await page(
      '지저분',
      '# 제목\n\n#### 깊은 헤딩\n\n```\nx\n```\n\n[[없는 문서]]\n',
    );

    const h = await health();
    // The home page was created with the space, before any summary: it needs a recheck.
    expect(h).toMatchObject({ space: 'PAY', totalPages: 3, stalePages: 1 });
    expect(h.totals).toEqual({ errors: 0, warnings: 2, infos: 1 });
    expect(h.pages).toHaveLength(1);
    expect(h.pages[0]).toMatchObject({ id: messy.id, warnings: 2, infos: 1, stale: false });
    expect(h.pages[0].rules).toContainEqual({
      ruleId: 'clavis/no-h1',
      severity: 'warning',
      count: 1,
      line: 6,
    });
    // Link findings come from page_links, not from the stored summary.
    expect(h.rules.map((r: { ruleId: string }) => r.ruleId).sort()).toEqual([
      'clavis/code-lang',
      'clavis/heading-increment',
      'clavis/no-h1',
    ]);
    expect(h.brokenLinks).toEqual([
      expect.objectContaining({ id: messy.id, targets: [{ spaceKey: 'PAY', title: '없는 문서' }] }),
    ]);

    // Creating the target fixes the link without touching the linking page.
    await page('없는 문서');
    expect((await health()).brokenLinks).toEqual([]);
  });

  it('updates the summary when a page is saved again', async () => {
    const p = await page('문서', '# 제목\n');
    expect((await health()).totals.warnings).toBe(1);
    const saved = await call(`/api/v1/pages/${p.id}`, {
      ...editor,
      method: 'PUT',
      body: { content: `${FM()}본문\n`, baseRevision: 1 },
    });
    expect(saved.status).toBe(200);
    const row = await env.DB.prepare('SELECT revision, warnings FROM page_lint WHERE page_id = ?')
      .bind(p.id)
      .first();
    expect(row).toEqual({ revision: 2, warnings: 0 });
  });

  it('rechecks stale pages in chunks under a new config', async () => {
    await page('a', '```\nx\n```\n');
    await page('b', '```\ny\n```\n');
    await recheck();
    expect((await health()).stalePages).toBe(0);

    // A config change makes every summary stale; the new level applies on recheck.
    await env.DB.prepare(
      `UPDATE spaces SET lint_config = ?, lint_config_version = lint_config_version + 1 WHERE key = 'PAY'`,
    )
      .bind(JSON.stringify({ rules: { 'clavis/code-lang': 'warning' }, requiredSections: {} }))
      .run();
    expect((await health()).stalePages).toBe(3);
    const r = await recheck();
    expect(r).toEqual({ checked: 3, remaining: 0 });
    const h = await health();
    expect(h.totals).toEqual({ errors: 0, warnings: 2, infos: 0 });
    expect(h.rules).toEqual([
      { ruleId: 'clavis/code-lang', severity: 'warning', pages: 2, count: 2 },
    ]);
  });

  it('stops each recheck near the byte budget and always makes progress', async () => {
    const big = `${'가'.repeat(20_000)}\n`; // ~60KB each
    for (const t of ['a', 'b', 'c']) await page(t, big);
    await env.DB.prepare("UPDATE spaces SET lint_config_version = 9 WHERE key = 'PAY'").run();
    const first = await recheck();
    // The first chunk fits RECHECK_BYTES (one 60KB page plus the small home page).
    expect(first.checked).toBeLessThan(4);
    expect(RECHECK_BYTES).toBe(100_000);
    let total = first.checked;
    for (let i = 0; i < 5 && total < 4; i++) total += (await recheck()).checked;
    expect(total).toBe(4);
    expect(await recheck()).toEqual({ checked: 0, remaining: 0 });
  });

  it('never overwrites the summary of a page saved after the recheck read it', async () => {
    const p = await page('문서', '# 제목\n');
    await env.DB.prepare("UPDATE spaces SET lint_config_version = 1 WHERE key = 'PAY'").run();
    // Someone saves the page right after the recheck's read batch, before its write.
    const racing = new Proxy(env.DB, {
      get(db, prop) {
        if (prop !== 'batch') return Reflect.get(db, prop).bind?.(db) ?? Reflect.get(db, prop);
        return async (stmts: D1PreparedStatement[]) => {
          const out = await db.batch(stmts);
          await db.prepare('UPDATE pages SET revision = 2 WHERE id = ?').bind(p.id).run();
          return out;
        };
      },
    });
    const r = await recheckSpace(racing, 'PAY');
    // The home page was written; the raced page was skipped and stays stale.
    expect(r).toEqual({ checked: 1, remaining: 1 });
    const row = await env.DB.prepare(
      'SELECT revision, config_version FROM page_lint WHERE page_id = ?',
    )
      .bind(p.id)
      .first();
    expect(row).toEqual({ revision: 1, config_version: 0 });
  });

  it('is readable by viewers and 404s for unknown spaces', async () => {
    expect((await call('/api/v1/spaces/NOPE/health', viewer)).status).toBe(404);
    expect(
      (await call('/api/v1/spaces/NOPE/lint/recheck', { ...viewer, method: 'POST' })).status,
    ).toBe(404);
  });
});
