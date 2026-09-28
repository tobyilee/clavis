/**
 * What a write changed, for the work that follows it (Phase 3 A2): version history,
 * notifications, webhooks and search. Services emit events; the request decides how they
 * are delivered, so a service never needs the queue or the execution context.
 *
 * Delivery happens after the response (waitUntil), but waitUntil CPU still counts toward
 * the request's 10ms. So the request only does cheap work (a queue send); anything that
 * spends CPU runs in the queue consumer, a separate invocation with its own budget (D-60,
 * D-62).
 */

import { revisionKey } from '../services/revisions';

export type PageEvent =
  | {
      type: 'page.saved';
      /** link-rewrite: another page's rename rewrote [[old title]] here (D-42). */
      kind: 'create' | 'update' | 'link-rewrite' | 'restore';
      pageId: string;
      revision: number;
      actorId: string;
      at: number;
      /** The saved text. Used during the request only; queue messages leave it out. */
      content: string;
    }
  | {
      type: 'page.trashed' | 'page.restored';
      pageIds: string[];
      batchId: string;
      actorId: string;
      at: number;
    }
  | {
      type: 'comment.created';
      commentId: string;
      threadId: string;
      pageId: string;
      actorId: string;
      at: number;
    }
  | {
      type: 'comment.resolved' | 'comment.reopened';
      threadId: string;
      pageId: string;
      actorId: string;
      at: number;
    }
  | {
      /** A page's text from before history began (D-54): stored, not announced. */
      type: 'revision.baseline';
      pageId: string;
      revision: number;
      content: string;
    };

/** An event as it travels on the queue: no page text (messages are billed per 64KB). */
export type QueuedEvent =
  | Omit<Extract<PageEvent, { type: 'page.saved' }>, 'content'>
  | Exclude<PageEvent, { type: 'page.saved' | 'revision.baseline' }>;

export type Emit = (event: PageEvent) => void;

/** The event sink of a Hono request. */
export const emitFor = (c: { env: Env; executionCtx: Pick<ExecutionContext, 'waitUntil'> }) =>
  eventSink(c.env, c.executionCtx);

/** Options every write service takes. */
export interface WriteOptions {
  now?: number;
  emit?: Emit;
}

export function toQueued(event: Exclude<PageEvent, { type: 'revision.baseline' }>): QueuedEvent {
  if (event.type !== 'page.saved') return event;
  const { content: _content, ...rest } = event;
  return rest;
}

/**
 * The request's event sink. After the response, a saved revision's text goes to R2 (it
 * exists only in this request, and writing a string costs little CPU), and the event goes
 * on the queue without the text.
 */
export function eventSink(env: Env, ctx: Pick<ExecutionContext, 'waitUntil'>): Emit {
  const settle = (type: string, work: Promise<unknown>) =>
    ctx.waitUntil(
      work.catch((e: unknown) => {
        // Losing this must not fail the write that already succeeded.
        console.error(JSON.stringify({ event: 'event-delivery-failed', type, error: String(e) }));
      }),
    );
  return (event) => {
    if (event.type === 'page.saved' || event.type === 'revision.baseline') {
      settle(event.type, env.FILES.put(revisionKey(event.pageId, event.revision), event.content));
    }
    if (event.type !== 'revision.baseline') settle(event.type, env.EVENTS.send(toQueued(event)));
  };
}

/** Work run by the queue consumer for each event (listed in events/handlers.ts). */
export type EventHandler = (env: Env, event: QueuedEvent) => Promise<void>;

/**
 * The queue consumer. Each message is handled on its own: one that fails is retried (up to
 * the queue's max_retries) without holding back the others.
 */
export async function consumeEvents(
  batch: MessageBatch<QueuedEvent>,
  env: Env,
  handlers: readonly EventHandler[],
): Promise<void> {
  for (const message of batch.messages) {
    try {
      for (const handle of handlers) await handle(env, message.body);
      message.ack();
    } catch (e) {
      console.error(
        JSON.stringify({
          event: 'event-failed',
          type: message.body.type,
          attempts: message.attempts,
          error: String(e),
        }),
      );
      message.retry();
    }
  }
}
