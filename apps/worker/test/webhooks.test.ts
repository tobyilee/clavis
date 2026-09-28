import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeEvents, type QueuedEvent } from '../src/events';
import { EVENT_HANDLERS } from '../src/events/handlers';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

const SLACK = 'https://hooks.slack.com/services/T000/B000/secretpart1234';
const RECEIVER = 'https://example.test/clavis-hook';

let adam: { bearer: string; id: string };
let queued: { body: QueuedEvent; delay?: number }[];
let posts: { url: string; headers: Headers; body: string }[];
let answer: () => Response;

async function deliver() {
  const messages = queued.splice(0).map(({ body }) => ({
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

beforeEach(async () => {
  await resetDb();
  adam = await agentWithRole('editor', 'Adam');
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
  queued = [];
  posts = [];
  answer = () => new Response('ok');
  vi.spyOn(env.EVENTS, 'send').mockImplementation(async (body, options) => {
    queued.push({ body: body as QueuedEvent, delay: options?.delaySeconds });
    return { metadata: {} } as QueueSendResponse;
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    posts.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: String(init?.body),
    });
    return answer();
  });
});

afterEach(() => vi.restoreAllMocks());

const addHook = (kind: 'slack' | 'json', url: string, events: string[], who: object = ADMIN) =>
  call('/api/v1/spaces/PAY/webhooks', { ...who, method: 'POST', body: { kind, url, events } });
const createPage = async (title = '결제 API 설계') =>
  (
    await call('/api/v1/spaces/PAY/pages', {
      ...adam,
      method: 'POST',
      body: { title, content: `${FM()}본문\n` },
    })
  ).json.page;
const edit = async (id: string, text: string) => {
  const current = (await call(`/api/v1/pages/${id}`, adam)).json;
  await call(`/api/v1/pages/${id}`, {
    ...adam,
    method: 'PUT',
    body: { content: `${FM()}${text}\n`, baseRevision: current.revision },
  });
};

describe('webhook settings (admin)', () => {
  it('are admin-only, check URLs, and never show a Slack URL whole', async () => {
    expect((await addHook('slack', SLACK, ['page.created'], adam)).status).toBe(403);
    expect((await addHook('slack', 'https://example.com/x', ['page.created'])).status).toBe(400);
    const slack = await addHook('slack', SLACK, ['page.created', 'page.updated']);
    expect(slack.status).toBe(201);
    expect(slack.json).toMatchObject({
      kind: 'slack',
      url: 'https://hooks.slack.com/…1234',
      secret: null,
      enabled: true,
    });
    const json = await addHook('json', RECEIVER, ['comment.created']);
    expect(json.json.secret).toMatch(/^[0-9a-f]{48}$/);

    const list = (await call('/api/v1/spaces/PAY/webhooks', ADMIN)).json.webhooks;
    expect(list.map((w: { kind: string }) => w.kind)).toEqual(['slack', 'json']);
    expect(JSON.stringify(list)).not.toContain('secretpart');

    const off = await call(`/api/v1/webhooks/${slack.json.id}`, {
      ...ADMIN,
      method: 'PATCH',
      body: { enabled: false },
    });
    expect(off.json.enabled).toBe(false);
    expect(
      (await call(`/api/v1/webhooks/${json.json.id}`, { ...ADMIN, method: 'DELETE' })).status,
    ).toBe(204);
  });

  it('sends a test message right away and records it', async () => {
    const hook = (await addHook('slack', SLACK, ['page.created'])).json;
    const res = await call(`/api/v1/webhooks/${hook.id}/test`, { ...ADMIN, method: 'POST' });
    expect(res.json).toEqual({ ok: true, status: 200, error: null });
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]?.body ?? '')).toEqual({
      text: '✅ Clavis 알림 채널이 연결됐습니다 (결제 · PAY)',
    });
    const list = (await call('/api/v1/spaces/PAY/webhooks', ADMIN)).json.webhooks;
    expect(list[0].deliveries).toEqual([
      expect.objectContaining({ event: 'ping', ok: true, status: 200, attempt: 1 }),
    ]);
  });
});

describe('webhook delivery (D-60)', () => {
  it('posts Slack messages for subscribed events, one per run of edits', async () => {
    await addHook('slack', SLACK, ['page.created', 'page.updated']);
    const page = await createPage();
    await edit(page.id, '수정 1');
    await edit(page.id, '수정 2');
    await deliver();
    expect(posts.map((p) => p.url)).toEqual([SLACK, SLACK]);
    const texts = posts.map((p) => JSON.parse(p.body).text as string);
    expect(texts[0]).toMatch(
      /^🤖 \*Adam\* · 새 문서 · \[PAY\] <https:\/\/clavis\.crawl-proxy\.workers\.dev\/s\/PAY\/p\/.+\|결제 API 설계>$/,
    );
    // The second edit falls in the first one's 5-minute window.
    expect(texts[1]).toMatch(
      /· 문서 수정 · \[PAY\] <.+\|결제 API 설계> r2 · <.+\/history\?r=2&base=1\|변경 보기>$/,
    );
  });

  it('signs JSON payloads and only sends the events asked for', async () => {
    const hook = (await addHook('json', RECEIVER, ['comment.created'])).json;
    const page = await createPage();
    await call(`/api/v1/pages/${page.id}/comments`, {
      ...ADMIN,
      method: 'POST',
      body: { body: `@[Adam](actor:${adam.id}) 확인 부탁` },
    });
    await deliver();
    expect(posts).toHaveLength(1);
    const [post] = posts;
    const payload = JSON.parse(post?.body ?? '');
    expect(payload).toMatchObject({
      event: 'comment.created',
      space: { key: 'PAY', name: '결제' },
      page: { id: page.id, title: '결제 API 설계' },
      actor: { name: 'owner', kind: 'human' },
      comment: { body: `@[Adam](actor:${adam.id}) 확인 부탁` },
    });
    expect(post?.headers.get('x-clavis-event')).toBe('comment.created');
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(hook.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const hex = post?.headers.get('x-clavis-signature')?.replace('sha256=', '') ?? '';
    const sig = new Uint8Array(hex.match(/../g)?.map((h) => Number.parseInt(h, 16)) ?? []);
    expect(await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(post?.body))).toBe(
      true,
    );
  });

  it('retries failures later on their own, and never posts an event twice', async () => {
    await addHook('slack', SLACK, ['page.created']);
    await createPage();
    const original = queued.map((q) => q.body);
    answer = () => new Response('down', { status: 503 });
    await deliver();
    expect(posts).toHaveLength(1);
    expect(queued).toEqual([
      { body: expect.objectContaining({ type: 'webhook.retry', attempt: 2 }), delay: 30 },
    ]);

    answer = () => new Response('ok');
    await deliver();
    expect(posts).toHaveLength(2);
    // The same queue message again (say, another handler failed): no second post.
    queued.push(...original.map((body) => ({ body })));
    await deliver();
    expect(posts).toHaveLength(2);

    const hook = (await call('/api/v1/spaces/PAY/webhooks', ADMIN)).json.webhooks[0];
    expect(
      hook.deliveries.map((d: { attempt: number; ok: boolean; status: number }) => [
        d.attempt,
        d.ok,
        d.status,
      ]),
    ).toEqual([
      [2, true, 200],
      [1, false, 503],
    ]);
  });
});
