import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeEvents, type QueuedEvent } from '../src/events';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

let editor: { bearer: string };
let sent: QueuedEvent[];

beforeEach(async () => {
  await resetDb();
  editor = await agentWithRole('editor');
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
  sent = [];
  vi.spyOn(env.EVENTS, 'send').mockImplementation(async (body) => {
    sent.push(body as QueuedEvent);
    return { metadata: {} } as QueueSendResponse;
  });
});

afterEach(() => vi.restoreAllMocks());

const create = async (title: string, body: string) =>
  (
    await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title, content: `${FM()}${body}` },
    })
  ).json.page;

describe('write events (Phase 3 A2)', () => {
  it('every write path emits an event, and queue messages carry no page text', async () => {
    const page = await create('정책', '## 범위\n\n본문\n');
    await call(`/api/v1/pages/${page.id}`, {
      ...editor,
      method: 'PUT',
      body: { content: `${FM()}## 범위\n\n고친 본문\n`, baseRevision: 1 },
    });
    await call(`/api/v1/pages/${page.id}/sections/범위`, {
      ...editor,
      method: 'PUT',
      body: { mode: 'append', content: '- 항목' },
    });
    await call(`/api/v1/pages/${page.id}/meta`, {
      ...editor,
      method: 'PATCH',
      body: { status: 'review' },
    });
    const trashed = await call(`/api/v1/pages/${page.id}`, { ...editor, method: 'DELETE' });
    await call(`/api/v1/trash/${trashed.json.batchId}/restore`, { ...editor, method: 'POST' });

    const actorId = (await call('/api/v1/me', editor)).json.id;
    expect(
      sent.map((e) => [e.type, 'kind' in e ? e.kind : '', 'revision' in e ? e.revision : 0]),
    ).toEqual([
      ['page.saved', 'create', 1],
      ['page.saved', 'update', 2],
      ['page.saved', 'update', 3],
      ['page.saved', 'update', 4],
      ['page.trashed', '', 0],
      ['page.restored', '', 0],
    ]);
    expect(sent.every((e) => 'actorId' in e && e.actorId === actorId && !('content' in e))).toBe(
      true,
    );
    expect(sent[4]).toMatchObject({ pageIds: [page.id], batchId: trashed.json.batchId });
  });

  it('a rename emits a save for each page whose link it rewrote', async () => {
    const target = await create('정책', '본문\n');
    const linking = await create('안내', '[[정책]] 참고\n');
    sent = [];
    await call(`/api/v1/pages/${target.id}`, {
      ...editor,
      method: 'PUT',
      body: { title: '환불 정책', content: `${FM()}본문\n`, baseRevision: 1 },
    });
    expect(sent).toMatchObject([
      { type: 'page.saved', kind: 'update', pageId: target.id, revision: 2 },
      { type: 'page.saved', kind: 'link-rewrite', pageId: linking.id, revision: 2 },
    ]);
  });

  it('a failed write emits nothing', async () => {
    await create('정책', '본문\n');
    sent = [];
    const bad = await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: '정책', content: `${FM()}본문\n` },
    });
    expect(bad.status).toBe(409);
    expect(sent).toEqual([]);
  });
});

describe('event consumer', () => {
  const message = (body: QueuedEvent) => ({
    id: body.type,
    timestamp: new Date(),
    attempts: 1,
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  });
  const event = (pageId: string): QueuedEvent => ({
    type: 'page.saved',
    kind: 'update',
    pageId,
    revision: 2,
    actorId: 'a',
    at: 0,
  });

  it('acks what the handlers finish and retries only what failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = message(event('ok'));
    const bad = message(event('bad'));
    const seen: string[] = [];
    await consumeEvents(
      { queue: 'clavis-events', messages: [ok, bad] } as unknown as MessageBatch<QueuedEvent>,
      env,
      [
        async (_env, e) => {
          if (e.type === 'page.saved') seen.push(e.pageId);
          if (e.type === 'page.saved' && e.pageId === 'bad') throw new Error('boom');
        },
      ],
    );
    expect(seen).toEqual(['ok', 'bad']);
    expect(ok.ack).toHaveBeenCalled();
    expect(ok.retry).not.toHaveBeenCalled();
    expect(bad.retry).toHaveBeenCalled();
    expect(bad.ack).not.toHaveBeenCalled();
  });
});
