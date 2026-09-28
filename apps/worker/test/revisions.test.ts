import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { revisionKey } from '../src/services/revisions';
import { purgeTrash } from '../src/services/trash';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

let editor: { bearer: string; id: string };
let viewer: { bearer: string };

beforeEach(async () => {
  await resetDb();
  editor = await agentWithRole('editor', 'Adam');
  viewer = await agentWithRole('viewer');
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
});

const create = async (title: string, body: string) =>
  (
    await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title, content: `${FM()}${body}` },
    })
  ).json.page;
const save = (id: string, body: string, baseRevision: number, title?: string) =>
  call(`/api/v1/pages/${id}`, {
    ...editor,
    method: 'PUT',
    body: { content: `${FM()}${body}`, baseRevision, ...(title ? { title } : {}) },
  });
const history = async (id: string, query = '') =>
  (await call(`/api/v1/pages/${id}/revisions${query}`, viewer)).json;
const text = async (id: string, n: number) =>
  (await call(`/api/v1/pages/${id}/revisions/${n}`, viewer)).json;

describe('version history (D-54)', () => {
  it('keeps every save, with who, kind and size, newest first', async () => {
    const page = await create('정책', '## 범위\n\n처음\n');
    await save(page.id, '## 범위\n\n둘째\n', 1);
    await call(`/api/v1/pages/${page.id}/sections/범위`, {
      ...editor,
      method: 'PUT',
      body: { mode: 'append', content: '- 항목' },
    });
    const list = await history(page.id);
    expect(list).toMatchObject({ revision: 3, nextBefore: null, historyStart: 1 });
    expect(
      list.revisions.map((r: { revision: number; kind: string }) => [r.revision, r.kind]),
    ).toEqual([
      [3, 'update'],
      [2, 'update'],
      [1, 'create'],
    ]);
    expect(list.revisions[0]).toMatchObject({
      actor: { id: editor.id, name: 'Adam', kind: 'agent' },
      title: '정책',
      restoredFrom: null,
    });
    expect(list.revisions[0].bytes).toBeGreaterThan(list.revisions[1].bytes);

    // Old text comes from R2; the current one also from the page row.
    expect((await text(page.id, 1)).content).toBe(`${FM()}## 범위\n\n처음\n`);
    expect((await text(page.id, 3)).content).toContain('- 항목');
    const page2 = await history(page.id, '?limit=2');
    expect(page2).toMatchObject({ nextBefore: 2, historyStart: null });
    expect((await history(page.id, '?before=2')).revisions).toHaveLength(1);
  });

  it('keeps the text from before history began, the first time a page is saved again', async () => {
    const page = await create('정책', '옛 본문\n');
    // As if the page was saved before Phase 3: no history at all.
    await env.DB.prepare('DELETE FROM page_revisions WHERE page_id = ?').bind(page.id).run();
    await env.FILES.delete(revisionKey(page.id, 1));

    await save(page.id, '새 본문\n', 1);
    await save(page.id, '더 새 본문\n', 2);
    const list = await history(page.id);
    expect(list.revisions.map((r: { kind: string }) => r.kind)).toEqual([
      'update',
      'update',
      'baseline',
    ]);
    expect((await text(page.id, 1)).content).toBe(`${FM()}옛 본문\n`);
  });

  it('records the pages a rename rewrote, with their text before and after', async () => {
    const target = await create('정책', '본문\n');
    const linking = await create('안내', '[[정책]] 참고\n');
    await env.DB.prepare('DELETE FROM page_revisions WHERE page_id = ?').bind(linking.id).run();
    await save(target.id, '본문\n', 1, '환불 정책');
    const list = await history(linking.id);
    expect(
      list.revisions.map((r: { revision: number; kind: string }) => [r.revision, r.kind]),
    ).toEqual([
      [2, 'link-rewrite'],
      [1, 'baseline'],
    ]);
    expect((await text(linking.id, 1)).content).toContain('[[정책]]');
    expect((await text(linking.id, 2)).content).toContain('[[환불 정책]]');
  });

  it('restores old text as a new revision (D-56)', async () => {
    const page = await create('정책', '처음\n');
    await save(page.id, '망가진 본문\n', 1);
    const restore = (n: number, who: object = editor, body?: object) =>
      call(`/api/v1/pages/${page.id}/revisions/${n}/restore`, {
        ...who,
        method: 'POST',
        body: body ?? {},
      });

    expect((await restore(1, viewer)).status).toBe(403);
    expect((await restore(2)).status).toBe(400);
    expect((await restore(1, editor, { baseRevision: 1 })).status).toBe(409);
    const ok = await restore(1);
    expect(ok.status).toBe(200);
    expect(ok.json.page.revision).toBe(3);
    expect((await call(`/api/v1/pages/${page.id}`, viewer)).json.content).toBe(`${FM()}처음\n`);
    expect((await history(page.id)).revisions[0]).toMatchObject({
      revision: 3,
      kind: 'restore',
      restoredFrom: 1,
    });
    expect((await call(`/api/v1/pages/${page.id}/revisions/9`, viewer)).status).toBe(404);
  });

  it('is removed with the page when the trash is emptied', async () => {
    const page = await create('정책', '처음\n');
    await save(page.id, '둘째\n', 1);
    await call(`/api/v1/pages/${page.id}`, { ...editor, method: 'DELETE' });
    await purgeTrash(env.DB, env.FILES, Date.now() + 31 * 86_400_000);
    const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM page_revisions').first();
    expect(rows).toEqual({ n: 0 });
    expect(await env.FILES.get(revisionKey(page.id, 1))).toBeNull();
    expect(await env.FILES.get(revisionKey(page.id, 2))).toBeNull();
  });
});
