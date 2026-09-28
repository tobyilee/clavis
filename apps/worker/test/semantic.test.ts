import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNKS_PER_RUN, consumeEvents, type QueuedEvent } from '../src/events';
import { EVENT_HANDLERS } from '../src/events/handlers';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

/**
 * In-memory stand-ins for Workers AI and Vectorize. The fake embedding is a bag of
 * character bigrams, so texts sharing words are close: enough to check the plumbing
 * (what gets embedded, stored, filtered and returned), not the model's quality (E5).
 */
function bigramVector(text: string): number[] {
  const v = new Array<number>(1024).fill(0);
  const s = text.toLowerCase().replace(/\s+/g, ' ');
  for (let i = 0; i < s.length - 1; i++) {
    let h = 0;
    for (const ch of s.slice(i, i + 2)) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
    v[h % 1024] = (v[h % 1024] ?? 0) + 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

let embedded: string[];
let vectors: Map<string, { values: number[]; metadata: Record<string, string> }>;
let queued: { body: QueuedEvent; delay?: number }[];
let adam: { bearer: string; id: string };

const bindings = env as unknown as Record<string, unknown>;

function installFakes() {
  bindings.AI = {
    run: async (_model: string, input: { text: string[] }) => {
      embedded.push(...input.text);
      return { shape: [input.text.length, 1024], data: input.text.map(bigramVector) };
    },
  };
  bindings.VECTORIZE = {
    upsert: async (vs: { id: string; values: number[]; metadata: Record<string, string> }[]) => {
      for (const v of vs) vectors.set(v.id, { values: v.values, metadata: v.metadata });
      return { mutationId: 'm' };
    },
    deleteByIds: async (ids: string[]) => {
      for (const id of ids) vectors.delete(id);
      return { mutationId: 'm' };
    },
    query: async (q: number[], opts: { topK: number; filter?: Record<string, string> }) => {
      const matches = [...vectors.entries()]
        .filter(([, v]) =>
          Object.entries(opts.filter ?? {}).every(([k, want]) => v.metadata[k] === want),
        )
        .map(([id, v]) => ({ id, score: v.values.reduce((sum, x, i) => sum + x * (q[i] ?? 0), 0) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, opts.topK);
      return { matches, count: matches.length };
    },
  };
}

async function deliver() {
  while (queued.length > 0) {
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
}

/** Runs one consumer batch only (to see what it leaves queued). */
async function deliverOnce() {
  const pending = queued.length;
  const messages = queued.splice(0, pending).map(({ body }) => ({
    id: crypto.randomUUID(),
    timestamp: new Date(),
    attempts: 1,
    body,
    ack: () => {},
    retry: () => {},
  }));
  await consumeEvents({ messages } as unknown as MessageBatch<QueuedEvent>, env, EVENT_HANDLERS);
}

const rows = async (pageId: string) =>
  (
    await env.DB.prepare(
      'SELECT section_id, heading, excerpt FROM page_chunks WHERE page_id = ? ORDER BY ord',
    )
      .bind(pageId)
      .all<{ section_id: string | null; heading: string | null; excerpt: string }>()
  ).results;

const createPage = async (title: string, body: string, space = 'PAY') =>
  (
    await call(`/api/v1/spaces/${space}/pages`, {
      ...adam,
      method: 'POST',
      body: { title, content: `${FM('spec')}${body}` },
    })
  ).json.page;

const edit = async (id: string, body: string) => {
  const current = (await call(`/api/v1/pages/${id}`, adam)).json;
  const res = await call(`/api/v1/pages/${id}`, {
    ...adam,
    method: 'PUT',
    body: { content: `${FM('spec')}${body}`, baseRevision: current.revision },
  });
  expect(res.status).toBe(200);
};

const PAYMENT = `결제 모듈의 설계 문서.

## 환불 정책

환불은 결제 후 7일 이내에만 가능하며 부분 환불을 지원한다.

## 정산 주기

가맹점 정산은 매주 월요일에 지난주 거래분을 지급한다.
`;

beforeEach(async () => {
  await resetDb();
  adam = await agentWithRole('editor', 'Adam');
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'OPS', name: '운영' } });
  embedded = [];
  vectors = new Map();
  queued = [];
  installFakes();
  vi.spyOn(env.EVENTS, 'send').mockImplementation(async (body, options) => {
    queued.push({ body: body as QueuedEvent, delay: options?.delaySeconds });
    return { metadata: {} } as QueueSendResponse;
  });
  vi.spyOn(env.EVENTS, 'sendBatch').mockImplementation(async (messages) => {
    for (const m of messages) queued.push({ body: m.body as QueuedEvent, delay: m.delaySeconds });
    return { metadata: {} } as QueueSendBatchResponse;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  bindings.AI = undefined;
  bindings.VECTORIZE = undefined;
});

describe('semantic indexing (E1, E2)', () => {
  it('embeds a saved page by H2 chunks, then only the chunks that changed', async () => {
    const page = await createPage('결제 설계', PAYMENT);
    await deliver();
    expect(embedded).toHaveLength(3);
    expect(embedded[1]).toBe(
      '결제 설계 › 환불 정책\n\n환불은 결제 후 7일 이내에만 가능하며 부분 환불을 지원한다.',
    );
    expect(await rows(page.id)).toEqual([
      { section_id: null, heading: null, excerpt: '결제 모듈의 설계 문서.' },
      {
        section_id: '환불-정책',
        heading: '환불 정책',
        excerpt: '환불은 결제 후 7일 이내에만 가능하며 부분 환불을 지원한다.',
      },
      {
        section_id: '정산-주기',
        heading: '정산 주기',
        excerpt: '가맹점 정산은 매주 월요일에 지난주 거래분을 지급한다.',
      },
    ]);
    expect([...vectors.values()][0]?.metadata).toEqual({ space: 'PAY', docType: 'spec' });

    await edit(page.id, PAYMENT.replace('매주 월요일', '매월 1일'));
    await deliver();
    expect(embedded).toHaveLength(4); // the changed section only
    expect(vectors.size).toBe(3); // its old vector is gone
    const status = (await call('/api/v1/admin/search-index', ADMIN)).json;
    // Each space's home page too: made with the space, before any event, so not yet indexed.
    expect(status).toEqual({
      available: true,
      pages: 3,
      indexed: 1,
      vectors: 3,
      vectorLimit: 4882,
    });
  });

  it('embeds a bounded number of chunks per run and continues in the next message', async () => {
    const sections = Array.from({ length: 12 }, (_, i) => `## 항목 ${i + 1}\n\n내용 ${i + 1}\n`);
    const page = await createPage('긴 문서', sections.join('\n'));
    await deliverOnce();
    expect(embedded).toHaveLength(CHUNKS_PER_RUN);
    expect(queued.map((q) => q.body)).toEqual([
      { type: 'index.page', pageId: page.id, attempt: 1 },
    ]);
    await deliver();
    expect(embedded).toHaveLength(12);
    expect(vectors.size).toBe(12);
    expect((await call('/api/v1/admin/search-index', ADMIN)).json.indexed).toBe(1);
  });

  it('drops a trashed page from the index and brings it back on restore', async () => {
    const page = await createPage('결제 설계', PAYMENT);
    await deliver();
    const trashed = await call(`/api/v1/pages/${page.id}`, { ...adam, method: 'DELETE' });
    await deliver();
    expect(vectors.size).toBe(0);
    expect(await rows(page.id)).toEqual([]);

    await call(`/api/v1/trash/${trashed.json.batchId}/restore`, { ...ADMIN, method: 'POST' });
    await deliver();
    expect(vectors.size).toBe(3);
  });

  it('retries a failed embedding on its own, without failing the message', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('4006: daily free allocation used'));
    const fake = bindings.AI as { run: (...a: unknown[]) => Promise<unknown> };
    const real = fake.run;
    fake.run = (...a) => (run.mock.calls.length === 0 ? run(...a) : real(...a));
    const page = await createPage('결제 설계', PAYMENT);
    await deliverOnce(); // retry() would throw: the message must succeed
    expect(queued).toEqual([
      { body: { type: 'index.page', pageId: page.id, attempt: 2 }, delay: 60 },
    ]);
    await deliver();
    expect(vectors.size).toBe(3);
  });
});

describe('backfill (E3)', () => {
  it('queues every page not indexed at its revision', async () => {
    bindings.AI = undefined; // saved before semantic search existed
    await createPage('결제 설계', PAYMENT);
    await createPage('장애 대응', '## 절차\n\n장애가 나면 당직자가 먼저 공지한다.\n', 'OPS');
    await deliver();
    installFakes();
    // Two pages and the two spaces' home pages.
    expect((await call('/api/v1/admin/search-index', ADMIN)).json).toMatchObject({
      pages: 4,
      indexed: 0,
    });
    expect((await call('/api/v1/admin/search-index', adam)).status).toBe(403);
    const res = await call('/api/v1/admin/search-index', { ...ADMIN, method: 'POST' });
    expect(res.status).toBe(202);
    expect(res.json).toEqual({ queued: 4 });
    await deliver();
    const status = (await call('/api/v1/admin/search-index', ADMIN)).json;
    expect(status.indexed).toBe(4);
    expect(status.vectors).toBeGreaterThanOrEqual(4);
    expect((await call('/api/v1/admin/search-index', { ...ADMIN, method: 'POST' })).json).toEqual({
      queued: 0,
    });
  });
});

describe('semantic search (E4)', () => {
  beforeEach(async () => {
    await createPage('결제 설계', PAYMENT);
    await createPage('장애 대응', '## 절차\n\n장애가 나면 당직자가 먼저 공지한다.\n', 'OPS');
    await deliver();
  });

  it('finds pages by their closest section, and filters by space', async () => {
    const res = await call(
      `/api/v1/search?q=${encodeURIComponent('환불은 결제 후 며칠 이내에 가능한가')}&mode=semantic`,
      adam,
    );
    expect(res.json.mode).toBe('semantic');
    expect(res.json.nextCursor).toBeNull();
    expect(res.json.hits[0]).toMatchObject({
      title: '결제 설계',
      section: { id: '환불-정책', title: '환불 정책' },
      snippet: '환불은 결제 후 7일 이내에만 가능하며 부분 환불을 지원한다.',
    });
    expect(res.json.hits[0].score).toBeGreaterThan(0.4);

    const ops = await call(
      `/api/v1/search?q=${encodeURIComponent('장애가 나면 당직자가 공지')}&mode=semantic&space=pay`,
      adam,
    );
    expect(ops.json.hits.map((h: { spaceKey: string }) => h.spaceKey)).not.toContain('OPS');
  });

  it('merges full text and meaning in hybrid mode, and falls back to text', async () => {
    const q = encodeURIComponent('가맹점 정산은 매주 월요일');
    const hybrid = await call(`/api/v1/search?q=${q}&mode=hybrid`, adam);
    expect(hybrid.json.mode).toBe('hybrid');
    expect(hybrid.json.hits[0]).toMatchObject({
      title: '결제 설계',
      section: { id: '정산-주기' },
    });
    expect(hybrid.json.hits[0].snippet).toContain(''); // the full-text snippet

    bindings.AI = { run: async () => Promise.reject(new Error('unavailable')) };
    const fallback = await call(
      `/api/v1/search?q=${encodeURIComponent('정산 주기')}&mode=semantic`,
      adam,
    );
    expect(fallback.json.mode).toBe('text');
    expect(fallback.json.hits[0].title).toBe('결제 설계');
  });

  it('is an MCP tool that points at read_section', async () => {
    const res = await call('/mcp', {
      ...adam,
      method: 'POST',
      headers: { accept: 'application/json, text/event-stream' },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'semantic_search', arguments: { query: '환불은 결제 후 7일 이내' } },
      },
    });
    const text = res.json.result.content[0].text as string;
    expect(text).toMatch(/^- PAY\/\w+ "결제 설계" section=환불-정책 "환불 정책" \[spec, draft\]/);
  });
});
