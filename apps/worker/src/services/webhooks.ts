import { pageSlugId, type WebhookEvent } from '@clavis/shared/schema';
import { ulid } from 'ulid';
import type { EventHandler, QueuedEvent, WebhookRetry } from '../events';
import type { Actor } from './actors';
import { notFound, ServiceError } from './errors';

/**
 * Outbound channels per space (D-58, D-60): Slack Incoming Webhooks and signed JSON
 * webhooks. The queue consumer delivers; a failure is queued again with a delay as a
 * `webhook.retry` message (up to 3 attempts), so retrying never repeats other handlers'
 * work. A delivery log per webhook doubles as the guard against posting an event twice.
 */

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS = [30, 120, 600];
const KEPT_DELIVERIES = 50;
/** Slack: one message per page per actor per 5 minutes for a run of edits (W3). */
const SLACK_EDIT_WINDOW_MS = 5 * 60_000;
const TIMEOUT_MS = 5_000;

type Source = Exclude<QueuedEvent, WebhookRetry>;

export interface WebhookRow {
  id: string;
  space_id: string;
  kind: 'slack' | 'json';
  url: string;
  secret: string;
  events: string;
  enabled: number;
  created_at: number;
}

/** Which webhook event a queue event is, and the page it is about. */
function classify(e: Source): { name: WebhookEvent; pageId: string } | null {
  switch (e.type) {
    case 'page.saved':
      if (e.kind === 'create') return { name: 'page.created', pageId: e.pageId };
      if (e.kind === 'update' || e.kind === 'restore')
        return { name: 'page.updated', pageId: e.pageId };
      return null; // link rewrites of a rename: noise in a channel
    case 'page.trashed':
      return e.pageIds[0] ? { name: 'page.deleted', pageId: e.pageIds[0] } : null;
    case 'page.restored':
      return e.pageIds[0] ? { name: 'page.restored', pageId: e.pageIds[0] } : null;
    case 'comment.created':
      return { name: 'comment.created', pageId: e.pageId };
    case 'comment.resolved':
      return { name: 'comment.resolved', pageId: e.pageId };
    default:
      return null;
  }
}

const eventKey = (e: Source) =>
  [
    e.type,
    'pageId' in e ? e.pageId : e.pageIds.join(','),
    'commentId' in e ? e.commentId : 'threadId' in e ? e.threadId : '',
    'revision' in e ? e.revision : '',
    e.at,
  ].join(':');

export const deliverOnEvent: EventHandler = async (env, event) => {
  if (event.type === 'webhook.retry') {
    const hook = await env.DB.prepare('SELECT * FROM webhooks WHERE id = ? AND enabled = 1')
      .bind(event.webhookId)
      .first<WebhookRow>();
    if (hook) await deliver(env, hook, event.event, event.attempt);
    return;
  }
  const what = classify(event);
  if (!what) return;
  const { results } = await env.DB.prepare(
    `SELECT w.* FROM webhooks w JOIN pages p ON p.space_id = w.space_id
     WHERE p.id = ? AND w.enabled = 1
       AND EXISTS (SELECT 1 FROM json_each(w.events) WHERE value = ?)`,
  )
    .bind(what.pageId, what.name)
    .all<WebhookRow>();
  for (const hook of results) await deliver(env, hook, event, 1);
};

interface Payload {
  event: WebhookEvent | 'ping';
  deliveryId: string;
  at: number;
  space: { key: string; name: string };
  page?: { id: string; shortId: string; title: string; url: string };
  actor?: { id: string; name: string; kind: 'human' | 'agent' };
  revision?: number;
  changesUrl?: string;
  pageCount?: number;
  comment?: { id: string; threadId: string; body: string; url: string };
}

async function buildPayload(env: Env, e: Source, name: WebhookEvent, pageId: string, id: string) {
  const commentId =
    e.type === 'comment.created' ? e.commentId : e.type === 'comment.resolved' ? e.threadId : null;
  const [pageRes, actorRes, commentRes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT p.id, p.short_id, p.title, p.slug, s.key, s.name AS space_name
       FROM pages p JOIN spaces s ON s.id = p.space_id WHERE p.id = ?`,
    ).bind(pageId),
    env.DB.prepare('SELECT id, name, kind FROM actors WHERE id = ?').bind(e.actorId),
    env.DB.prepare('SELECT id, thread_id, body FROM comments WHERE id = ?').bind(commentId ?? ''),
  ]);
  const page = pageRes?.results[0] as
    | { id: string; short_id: string; title: string; slug: string; key: string; space_name: string }
    | undefined;
  if (!page) return null;
  const url = `${env.APP_ORIGIN}/s/${page.key}/p/${encodeURI(pageSlugId(page.slug, page.short_id))}`;
  const actor = actorRes?.results[0] as
    | { id: string; name: string; kind: 'human' | 'agent' }
    | undefined;
  const comment = commentRes?.results[0] as
    | { id: string; thread_id: string; body: string }
    | undefined;
  const payload: Payload = {
    event: name,
    deliveryId: id,
    at: e.at,
    space: { key: page.key, name: page.space_name },
    page: { id: page.id, shortId: page.short_id, title: page.title, url },
    ...(actor ? { actor } : {}),
  };
  if (e.type === 'page.saved') {
    payload.revision = e.revision;
    if (e.revision > 1)
      payload.changesUrl = `${url}/history?r=${e.revision}&base=${e.revision - 1}`;
  }
  if (e.type === 'page.trashed' || e.type === 'page.restored') payload.pageCount = e.pageIds.length;
  if (comment) {
    payload.comment = {
      id: comment.id,
      threadId: comment.thread_id,
      body: comment.body.length > 1000 ? `${comment.body.slice(0, 1000)}…` : comment.body,
      url: `${url}#comments`,
    };
  }
  return payload;
}

/** Slack mrkdwn needs &, < and > escaped outside links. */
const esc = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function slackMessage(p: Payload): { text: string } {
  if (p.event === 'ping')
    return { text: `✅ Clavis 알림 채널이 연결됐습니다 (${esc(p.space.name)} · ${p.space.key})` };
  const who = p.actor
    ? `${p.actor.kind === 'agent' ? '🤖' : '🧑'} *${esc(p.actor.name)}*`
    : 'Clavis';
  const page = p.page ? `<${p.page.url}|${esc(p.page.title)}>` : '';
  const space = `[${p.space.key}]`;
  switch (p.event) {
    case 'page.created':
      return { text: `${who} · 새 문서 · ${space} ${page}` };
    case 'page.updated':
      return {
        text: `${who} · 문서 수정 · ${space} ${page} r${p.revision}${p.changesUrl ? ` · <${p.changesUrl}|변경 보기>` : ''}`,
      };
    case 'page.deleted':
      return {
        text: `${who} · 휴지통으로 이동 · ${space} ${esc(p.page?.title ?? '')}${(p.pageCount ?? 1) > 1 ? ` (하위 문서 ${(p.pageCount ?? 1) - 1}개 포함)` : ''}`,
      };
    case 'page.restored':
      return { text: `${who} · 휴지통에서 복원 · ${space} ${page}` };
    case 'comment.created': {
      const quote = (p.comment?.body ?? '')
        .replace(/@\[([^\]]+)\]\(actor:\w+\)/g, '@$1')
        .split('\n')
        .slice(0, 6)
        .map((l) => `> ${esc(l)}`)
        .join('\n');
      return {
        text: `${who} · 새 댓글 · ${space} <${p.comment?.url ?? ''}|${esc(p.page?.title ?? '')}>\n${quote}`,
      };
    }
    case 'comment.resolved':
      return { text: `${who} · 댓글 해결 · ${space} ${page}` };
  }
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `sha256=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Sends one payload and says how it went. Never throws. */
async function post(hook: WebhookRow, payload: Payload) {
  const body = JSON.stringify(hook.kind === 'slack' ? slackMessage(payload) : payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'Clavis-Webhook/1',
  };
  if (hook.kind === 'json') {
    headers['x-clavis-event'] = payload.event;
    headers['x-clavis-delivery'] = payload.deliveryId;
    headers['x-clavis-signature'] = await sign(hook.secret, body);
  }
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Drain it: an unread body keeps the connection busy.
    const text = await res.text();
    return {
      status: res.status,
      ok: res.ok,
      error: res.ok ? null : text.slice(0, 200) || res.statusText,
      retryable: res.status >= 500 || res.status === 429,
    };
  } catch (e) {
    return { status: null, ok: false, error: String(e).slice(0, 200), retryable: true };
  }
}

function recordStatements(
  DB: D1Database,
  hook: WebhookRow,
  row: {
    id: string;
    key: string;
    event: string;
    pageId: string | null;
    actorId: string | null;
    attempt: number;
  },
  result: { status: number | null; ok: boolean; error: string | null },
  now: number,
) {
  return [
    DB.prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_key, event, page_id, actor_id, attempt, status, ok, error, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      row.id,
      hook.id,
      row.key,
      row.event,
      row.pageId,
      row.actorId,
      row.attempt,
      result.status,
      result.ok ? 1 : 0,
      result.error,
      now,
    ),
    DB.prepare(
      `DELETE FROM webhook_deliveries WHERE webhook_id = ? AND id NOT IN (
         SELECT id FROM webhook_deliveries WHERE webhook_id = ? ORDER BY at DESC, id DESC LIMIT ?)`,
    ).bind(hook.id, hook.id, KEPT_DELIVERIES),
  ];
}

async function deliver(env: Env, hook: WebhookRow, event: Source, attempt: number) {
  const what = classify(event);
  if (!what) return;
  const key = eventKey(event);
  const now = Date.now();
  const actorId = 'actorId' in event ? event.actorId : null;
  const [doneRes, recentRes] = await env.DB.batch([
    env.DB.prepare(
      'SELECT 1 FROM webhook_deliveries WHERE webhook_id = ? AND event_key = ? AND ok = 1',
    ).bind(hook.id, key),
    env.DB.prepare(
      `SELECT 1 FROM webhook_deliveries WHERE webhook_id = ? AND ok = 1 AND event = 'page.updated'
         AND page_id = ? AND actor_id = ? AND at > ?`,
    ).bind(hook.id, what.pageId, actorId, now - SLACK_EDIT_WINDOW_MS),
  ]);
  if (doneRes?.results.length) return; // already delivered (a retried queue message)
  if (hook.kind === 'slack' && what.name === 'page.updated' && recentRes?.results.length) return;

  const id = ulid(now);
  const payload = await buildPayload(env, event, what.name, what.pageId, id);
  if (!payload) return;
  const result = await post(hook, payload);
  await env.DB.batch(
    recordStatements(
      env.DB,
      hook,
      { id, key, event: what.name, pageId: what.pageId, actorId, attempt },
      result,
      now,
    ),
  );
  if (!result.ok && result.retryable && attempt < MAX_ATTEMPTS) {
    const retry: WebhookRetry = {
      type: 'webhook.retry',
      webhookId: hook.id,
      attempt: attempt + 1,
      event,
    };
    await env.EVENTS.send(retry, { delaySeconds: RETRY_DELAYS[attempt - 1] });
  }
}

// ── Settings API (admin) ─────────────────────────────────────────────────────

/** Shows where a URL goes without its secret part (Slack's path is its token). */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.slice(-4);
    return `${u.origin}/…${tail}`;
  } catch {
    return '…';
  }
}

export function checkUrl(kind: 'slack' | 'json', url: string) {
  const ok =
    kind === 'slack'
      ? /^https:\/\/hooks\.slack\.com\/services\/[\w/]+$/.test(url)
      : /^https:\/\//.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
  if (!ok) {
    throw new ServiceError(400, 'invalid-url', 'Invalid webhook URL', {
      detail:
        kind === 'slack'
          ? 'Use the Incoming Webhook URL Slack gives you (https://hooks.slack.com/services/…).'
          : 'Use an https:// URL.',
    });
  }
}

const randomSecret = () =>
  [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

interface DeliveryRow {
  webhook_id: string;
  event: string;
  attempt: number;
  status: number | null;
  ok: number;
  error: string | null;
  at: number;
}

const toWebhook = (w: WebhookRow, deliveries: DeliveryRow[]) => ({
  id: w.id,
  kind: w.kind,
  url: maskUrl(w.url),
  // A JSON receiver needs it to check signatures; admins may see it.
  secret: w.kind === 'json' ? w.secret : null,
  events: JSON.parse(w.events) as WebhookEvent[],
  enabled: w.enabled === 1,
  createdAt: w.created_at,
  deliveries: deliveries
    .filter((d) => d.webhook_id === w.id)
    .slice(0, 10)
    .map((d) => ({
      event: d.event,
      attempt: d.attempt,
      status: d.status,
      ok: d.ok === 1,
      error: d.error,
      at: d.at,
    })),
});

export async function listWebhooks(DB: D1Database, spaceKey: string) {
  const [spaceRes, hooksRes, deliveriesRes] = await DB.batch([
    DB.prepare('SELECT id FROM spaces WHERE key = ?').bind(spaceKey),
    DB.prepare(
      'SELECT w.* FROM webhooks w JOIN spaces s ON s.id = w.space_id WHERE s.key = ? ORDER BY w.created_at',
    ).bind(spaceKey),
    DB.prepare(
      `SELECT d.webhook_id, d.event, d.attempt, d.status, d.ok, d.error, d.at FROM webhook_deliveries d
       JOIN webhooks w ON w.id = d.webhook_id JOIN spaces s ON s.id = w.space_id
       WHERE s.key = ? ORDER BY d.at DESC, d.id DESC LIMIT 200`,
    ).bind(spaceKey),
  ]);
  if (!spaceRes?.results.length) throw notFound('Space');
  const deliveries = (deliveriesRes?.results ?? []) as unknown as DeliveryRow[];
  return ((hooksRes?.results ?? []) as unknown as WebhookRow[]).map((w) =>
    toWebhook(w, deliveries),
  );
}

export async function createWebhook(
  DB: D1Database,
  actor: Actor,
  spaceKey: string,
  input: { kind: 'slack' | 'json'; url: string; events: WebhookEvent[] },
  now = Date.now(),
) {
  checkUrl(input.kind, input.url);
  const space = await DB.prepare('SELECT id FROM spaces WHERE key = ?')
    .bind(spaceKey)
    .first<{ id: string }>();
  if (!space) throw notFound('Space');
  const row: WebhookRow = {
    id: ulid(now),
    space_id: space.id,
    kind: input.kind,
    url: input.url,
    secret: randomSecret(),
    events: JSON.stringify([...new Set(input.events)]),
    enabled: 1,
    created_at: now,
  };
  await DB.prepare(
    `INSERT INTO webhooks (id, space_id, kind, url, secret, events, enabled, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  )
    .bind(row.id, row.space_id, row.kind, row.url, row.secret, row.events, actor.id, now)
    .run();
  return toWebhook(row, []);
}

async function loadWebhook(DB: D1Database, id: string) {
  const hook = await DB.prepare('SELECT * FROM webhooks WHERE id = ?').bind(id).first<WebhookRow>();
  if (!hook) throw notFound('Webhook');
  return hook;
}

export async function updateWebhook(
  DB: D1Database,
  id: string,
  patch: { url?: string; events?: WebhookEvent[]; enabled?: boolean },
) {
  const hook = await loadWebhook(DB, id);
  if (patch.url !== undefined) checkUrl(hook.kind, patch.url);
  const next: WebhookRow = {
    ...hook,
    url: patch.url ?? hook.url,
    events: patch.events ? JSON.stringify([...new Set(patch.events)]) : hook.events,
    enabled: patch.enabled === undefined ? hook.enabled : patch.enabled ? 1 : 0,
  };
  await DB.prepare('UPDATE webhooks SET url = ?, events = ?, enabled = ? WHERE id = ?')
    .bind(next.url, next.events, next.enabled, id)
    .run();
  return toWebhook(next, []);
}

export async function deleteWebhook(DB: D1Database, id: string) {
  await loadWebhook(DB, id);
  await DB.batch([
    DB.prepare('DELETE FROM webhook_deliveries WHERE webhook_id = ?').bind(id),
    DB.prepare('DELETE FROM webhooks WHERE id = ?').bind(id),
  ]);
}

/** Sends a ping right away (not through the queue) and reports the result. */
export async function testWebhook(env: Env, id: string, now = Date.now()) {
  const hook = await loadWebhook(env.DB, id);
  const space = await env.DB.prepare('SELECT key, name FROM spaces WHERE id = ?')
    .bind(hook.space_id)
    .first<{ key: string; name: string }>();
  const deliveryId = ulid(now);
  const result = await post(hook, {
    event: 'ping',
    deliveryId,
    at: now,
    space: { key: space?.key ?? '', name: space?.name ?? '' },
  });
  await env.DB.batch(
    recordStatements(
      env.DB,
      hook,
      {
        id: deliveryId,
        key: `ping:${now}`,
        event: 'ping',
        pageId: null,
        actorId: null,
        attempt: 1,
      },
      result,
      now,
    ),
  );
  return { ok: result.ok, status: result.status, error: result.error };
}
