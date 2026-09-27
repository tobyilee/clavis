import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { purgeTrash } from '../src/services/trash';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

let editor: { bearer: string };
let viewer: { bearer: string };
let pageId: string;

const threads = async (status = '') =>
  (await call(`/api/v1/pages/${pageId}/comments${status ? `?status=${status}` : ''}`, viewer)).json
    .threads;
const post = (who: { bearer?: string; as?: string }, body: Record<string, unknown>) =>
  call(`/api/v1/pages/${pageId}/comments`, { ...who, method: 'POST', body });

beforeEach(async () => {
  await resetDb();
  editor = await agentWithRole('editor', 'hermes');
  viewer = await agentWithRole('viewer', 'reviewer');
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
  const created = await call('/api/v1/spaces/PAY/pages', {
    ...editor,
    method: 'POST',
    body: { title: '정책', content: `${FM()}## 환불\n\n본문\n` },
  });
  pageId = created.json.page.id;
});

describe('comments (D-44, D-45)', () => {
  it('threads with one level of replies; viewers may comment', async () => {
    const root = await post(viewer, { body: '환불 기간이 **3일**이 맞나요?', sectionId: '환불' });
    expect(root.status).toBe(201);
    expect(root.json).toMatchObject({
      author: { name: 'reviewer', kind: 'agent' },
      threadId: root.json.id,
      updatedAt: null,
    });
    const reply = await post(editor, { body: '네, 3일입니다.', replyTo: root.json.id });
    // A reply to a reply lands in the same thread.
    const nested = await post(ADMIN, { body: '확인', replyTo: reply.json.id });
    expect(nested.json.threadId).toBe(root.json.id);
    await post(editor, { body: '페이지 전체 의견' });

    const list = await threads();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      body: '환불 기간이 **3일**이 맞나요?',
      sectionId: '환불',
      resolvedAt: null,
    });
    expect(list[0].replies.map((r: { body: string }) => r.body)).toEqual([
      '네, 3일입니다.',
      '확인',
    ]);
    expect(list[1].sectionId).toBeNull();
  });

  it('resolves and reopens a thread from any of its comments (editors only)', async () => {
    const root = await post(viewer, { body: '질문' });
    const reply = await post(editor, { body: '답' });
    const inThread = await post(editor, { body: '답글', replyTo: root.json.id });
    expect(reply.status).toBe(201);

    const denied = await call(`/api/v1/comments/${root.json.id}/resolve`, {
      ...viewer,
      method: 'POST',
    });
    expect(denied.status).toBe(403);
    const resolved = await call(`/api/v1/comments/${inThread.json.id}/resolve`, {
      ...editor,
      method: 'POST',
    });
    expect(resolved.json).toMatchObject({ threadId: root.json.id });
    expect((await threads('open')).map((t: { body: string }) => t.body)).toEqual(['답']);
    const done = await threads('resolved');
    expect(done[0]).toMatchObject({ body: '질문', resolvedBy: { name: 'hermes' } });

    await call(`/api/v1/comments/${root.json.id}/reopen`, { ...editor, method: 'POST' });
    expect(await threads('open')).toHaveLength(2);
  });

  it('lets authors edit, authors and admins delete, but not a comment with replies', async () => {
    const mine = await post(viewer, { body: '오타' });
    const edited = await call(`/api/v1/comments/${mine.json.id}`, {
      ...viewer,
      method: 'PATCH',
      body: { body: '오타 수정' },
    });
    expect(edited.status).toBe(204);
    const notMine = await call(`/api/v1/comments/${mine.json.id}`, {
      ...editor,
      method: 'PATCH',
      body: { body: '남의 글' },
    });
    expect(notMine.status).toBe(403);
    expect((await threads())[0]).toMatchObject({
      body: '오타 수정',
      updatedAt: expect.any(Number),
    });

    await post(editor, { body: '답', replyTo: mine.json.id });
    const withReplies = await call(`/api/v1/comments/${mine.json.id}`, {
      ...viewer,
      method: 'DELETE',
    });
    expect(withReplies.status).toBe(409);

    const other = await post(editor, { body: '지울 글' });
    expect(
      (await call(`/api/v1/comments/${other.json.id}`, { ...viewer, method: 'DELETE' })).status,
    ).toBe(403);
    expect(
      (await call(`/api/v1/comments/${other.json.id}`, { ...ADMIN, method: 'DELETE' })).status,
    ).toBe(204);
    expect(await threads()).toHaveLength(1);
  });

  it('validates bodies and targets', async () => {
    expect((await post(viewer, { body: '   ' })).status).toBe(400);
    expect((await post(viewer, { body: 'x'.repeat(10 * 1024 + 1) })).status).toBe(400);
    expect((await post(viewer, { body: 'x', replyTo: 'nope' })).status).toBe(404);
    expect((await call('/api/v1/pages/nope00/comments', viewer)).status).toBe(404);
  });

  it('hides comments with a trashed page, restores them, and purges them', async () => {
    await post(viewer, { body: '남아 있어야 함' });
    const del = await call(`/api/v1/pages/${pageId}`, { ...editor, method: 'DELETE' });
    expect((await call(`/api/v1/pages/${pageId}/comments`, viewer)).status).toBe(404);
    await call(`/api/v1/trash/${del.json.batchId}/restore`, { ...editor, method: 'POST' });
    expect(await threads()).toHaveLength(1);

    await call(`/api/v1/pages/${pageId}`, { ...editor, method: 'DELETE' });
    await purgeTrash(env.DB, env.FILES, Date.now() + 31 * 86_400_000);
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments').first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
