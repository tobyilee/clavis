import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeEvents, type QueuedEvent } from '../src/events';
import { EVENT_HANDLERS } from '../src/events/handlers';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

const TEAMMATE = { as: 'teammate@gmail.com' };
let adam: { bearer: string; id: string };
let queued: QueuedEvent[];

/** Runs the queue consumer on everything sent so far, as the queue would. */
async function deliver() {
  const messages = queued.splice(0).map((body) => ({
    id: crypto.randomUUID(),
    timestamp: new Date(),
    attempts: 1,
    body,
    ack: () => {},
    retry: () => {
      throw new Error(`event failed: ${JSON.stringify(body)}`);
    },
  }));
  await consumeEvents({ messages } as unknown as MessageBatch<QueuedEvent>, env, EVENT_HANDLERS);
}

const inbox = async (who: object, query = '') => {
  await deliver();
  return (await call(`/api/v1/me/notifications${query}`, who)).json;
};

beforeEach(async () => {
  await resetDb();
  adam = await agentWithRole('editor', 'Adam');
  await call('/api/v1/me', TEAMMATE);
  const people = (await call('/api/v1/admin/actors', ADMIN)).json.actors as {
    id: string;
    email: string;
  }[];
  const teammate = people.find((p) => p.email === 'teammate@gmail.com');
  await call(`/api/v1/admin/actors/${teammate?.id}`, {
    ...ADMIN,
    method: 'PATCH',
    body: { role: 'editor' },
  });
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
  queued = [];
  vi.spyOn(env.EVENTS, 'send').mockImplementation(async (body) => {
    queued.push(body as QueuedEvent);
    return { metadata: {} } as QueueSendResponse;
  });
});

afterEach(() => vi.restoreAllMocks());

/** A page created by the admin (a person), so the admin hears about it. */
async function adminPage(title = '정책') {
  const res = await call('/api/v1/spaces/PAY/pages', {
    ...ADMIN,
    method: 'POST',
    body: { title, content: `${FM()}본문\n` },
  });
  return res.json.page as { id: string; shortId: string; revision: number };
}
const edit = async (who: object, id: string, text: string) => {
  const current = (await call(`/api/v1/pages/${id}`, who)).json;
  return call(`/api/v1/pages/${id}`, {
    ...who,
    method: 'PUT',
    body: { content: `${FM()}${text}\n`, baseRevision: current.revision },
  });
};
const comment = (who: object, id: string, body: string) =>
  call(`/api/v1/pages/${id}/comments`, { ...who, method: 'POST', body: { body } });

describe('notifications (D-57)', () => {
  it("tells a page's creator about changes, folding unread repeats into one", async () => {
    const page = await adminPage();
    await edit(adam, page.id, '에이전트 수정 1');
    await edit(adam, page.id, '에이전트 수정 2');
    let mine = await inbox(ADMIN);
    expect(mine.unread).toBe(1);
    expect(mine.notifications).toEqual([
      expect.objectContaining({
        kind: 'page.changed',
        page: expect.objectContaining({ id: page.id, title: '정책', spaceKey: 'PAY' }),
        actor: { id: adam.id, name: 'Adam', kind: 'agent' },
        count: 2,
        fromRevision: 1,
        toRevision: 3,
        readAt: null,
      }),
    ]);
    // Nobody hears about their own edits, and nobody else is watching.
    expect((await inbox(TEAMMATE)).unread).toBe(0);
    expect((await inbox(adam)).unread).toBe(0);

    await call('/api/v1/me/notifications/read', { ...ADMIN, method: 'POST', body: {} });
    await edit(adam, page.id, '에이전트 수정 3');
    mine = await inbox(ADMIN);
    expect(mine.unread).toBe(1);
    expect(mine.notifications[0]).toMatchObject({ count: 1, fromRevision: 3, toRevision: 4 });
    expect(mine.notifications[1]).toMatchObject({ count: 2, readAt: expect.any(Number) });
  });

  it('follows explicit watches and mutes, and the agent-edit preference', async () => {
    const page = await adminPage();
    const watch = (who: object, mode: 'watch' | 'mute' | null) =>
      call(`/api/v1/pages/${page.id}/watch`, { ...who, method: 'PUT', body: { mode } });
    expect((await call(`/api/v1/pages/${page.id}/watch`, ADMIN)).json).toEqual({
      watching: true,
      muted: false,
      reason: 'creator',
    });
    expect((await watch(TEAMMATE, 'watch')).json).toMatchObject({
      watching: true,
      reason: 'watch',
    });
    expect((await watch(ADMIN, 'mute')).json).toMatchObject({ watching: false, muted: true });

    await edit(adam, page.id, '수정');
    expect((await inbox(TEAMMATE)).unread).toBe(1);
    expect((await inbox(ADMIN)).unread).toBe(0);

    await call('/api/v1/me/notifications/settings', {
      ...TEAMMATE,
      method: 'PUT',
      body: { muteAgentEdits: true },
    });
    await call('/api/v1/me/notifications/read', { ...TEAMMATE, method: 'POST', body: {} });
    await edit(adam, page.id, '또 수정');
    expect((await inbox(TEAMMATE)).unread).toBe(0);
    await watch(ADMIN, null);
    await edit(ADMIN, page.id, '사람 수정');
    expect(await inbox(TEAMMATE)).toMatchObject({ unread: 1, muteAgentEdits: true });
  });

  it('tells watchers about comments and mentioned people and agents about mentions', async () => {
    const page = await adminPage();
    const me = (await call('/api/v1/me', TEAMMATE)).json;
    await comment(TEAMMATE, page.id, `@[Adam](actor:${adam.id}) 이 섹션 정리 부탁해요`);
    await comment(adam, page.id, '@teammate 확인했습니다');

    const admin = await inbox(ADMIN);
    expect(admin.notifications).toEqual([
      expect.objectContaining({
        kind: 'comment',
        count: 2,
        actor: expect.objectContaining({ name: 'Adam' }),
      }),
    ]);
    // Adam hears it as a mention (agents get mentions only, D-59).
    const agent = await inbox(adam);
    expect(agent.notifications).toEqual([
      expect.objectContaining({ kind: 'mention', actor: expect.objectContaining({ id: me.id }) }),
    ]);
    expect(agent.notifications[0].commentId).toBeTruthy();
    // The teammate commented (so watches), but hears Adam's reply once, as a mention.
    const teammate = await inbox(TEAMMATE);
    expect(teammate.notifications.map((n: { kind: string }) => n.kind)).toEqual(['mention']);
  });

  it('lets an agent read its mentions over MCP and mark them handled (D-59)', async () => {
    const page = await adminPage();
    await comment(TEAMMATE, page.id, '@Adam 요약 부탁해요');
    await deliver();
    const tool = async (name: string, args: object = {}) => {
      const res = await call('/mcp', {
        ...adam,
        method: 'POST',
        headers: { accept: 'application/json, text/event-stream' },
        body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
      });
      return res.json.result.content[0].text as string;
    };
    const listed = await tool('list_notifications');
    expect(listed).toMatch(
      /^1 unread\n- \[\w+\] mention by teammate on PAY\/\w+ "정책" comment=\w+$/,
    );
    expect(await tool('mark_notifications_read')).toBe('Marked 1 read.');
    expect(await tool('list_notifications')).toBe('No unread notifications.');
  });

  it('hides notifications of trashed pages and lists who can be mentioned', async () => {
    const page = await adminPage();
    await edit(adam, page.id, '수정');
    expect((await inbox(ADMIN)).unread).toBe(1);
    await call(`/api/v1/pages/${page.id}`, { ...ADMIN, method: 'DELETE' });
    expect(await inbox(ADMIN)).toMatchObject({ unread: 0, notifications: [] });

    const actors = (await call('/api/v1/actors', TEAMMATE)).json.actors;
    expect(actors.map((a: { name: string; kind: string }) => [a.name, a.kind])).toEqual([
      ['owner', 'human'],
      ['teammate', 'human'],
      ['Adam', 'agent'],
    ]);
  });
});
