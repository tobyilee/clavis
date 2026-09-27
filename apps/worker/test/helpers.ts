import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { createApp } from '../src/app';

const app = createApp();

export async function resetDb() {
  await env.DB.batch(
    ['attachments', 'page_links', 'page_tags', 'pages', 'spaces', 'api_tokens', 'actors'].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
}

interface CallOptions {
  /** Simulates a Cloudflare Access login with this email. */
  as?: string;
  bearer?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Calls the app with a fake ExecutionContext, so ctx.access can be controlled per request. */
export async function call(path: string, opts: CallOptions = {}) {
  // Real requests through Cloudflare always carry Host; the MCP transport validates it.
  const headers = new Headers({ 'cf-connecting-ip': '192.0.2.1', host: 'clavis.test' });
  if (opts.bearer) headers.set('authorization', `Bearer ${opts.bearer}`);
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers.set(k, v);

  const base = createExecutionContext();
  const ctx = {
    waitUntil: (p: Promise<unknown>) => base.waitUntil(p),
    passThroughOnException: () => {},
    props: {},
    access: opts.as
      ? { aud: 'test', getIdentity: async () => ({ email: opts.as, name: opts.as?.split('@')[0] }) }
      : undefined,
  } as unknown as ExecutionContext;

  const res = await app.fetch(
    new Request(`https://clavis.test${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    env,
    ctx,
  );
  await waitOnExecutionContext(base);
  const text = await res.text();
  const type = res.headers.get('content-type');
  // Streamable HTTP may answer as SSE: take the JSON from the last "data:" line.
  const payload = type?.includes('text/event-stream')
    ? (text
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .at(-1)
        ?.slice(5)
        .trim() ?? '')
    : text;
  // biome-ignore lint/suspicious/noExplicitAny: tests assert on arbitrary response shapes
  let json: any = null;
  try {
    json = payload ? JSON.parse(payload) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, type, json };
}
