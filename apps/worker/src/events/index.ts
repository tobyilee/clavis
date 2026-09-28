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

export type PageEvent =
  | {
      type: 'page.saved';
      /** link-rewrite: another page's rename rewrote [[old title]] here (D-42). */
      kind: 'create' | 'update' | 'link-rewrite';
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
    };

/** An event as it travels on the queue: no page text (messages are billed per 64KB). */
export type QueuedEvent =
  | Omit<Extract<PageEvent, { type: 'page.saved' }>, 'content'>
  | Extract<PageEvent, { type: 'page.trashed' | 'page.restored' }>;

export type Emit = (event: PageEvent) => void;

/** The event sink of a Hono request. */
export const emitFor = (c: { env: Env; executionCtx: Pick<ExecutionContext, 'waitUntil'> }) =>
  eventSink(c.env, c.executionCtx);

/** Options every write service takes. */
export interface WriteOptions {
  now?: number;
  emit?: Emit;
}

export function toQueued(event: PageEvent): QueuedEvent {
  if (event.type !== 'page.saved') return event;
  const { content: _content, ...rest } = event;
  return rest;
}

/** The request's event sink: after the response, each event goes on the queue. */
export function eventSink(env: Env, ctx: Pick<ExecutionContext, 'waitUntil'>): Emit {
  return (event) => {
    ctx.waitUntil(
      env.EVENTS.send(toQueued(event)).catch((e: unknown) => {
        // Losing an event must not fail the write that already succeeded.
        console.error(
          JSON.stringify({ event: 'event-send-failed', type: event.type, error: String(e) }),
        );
      }),
    );
  };
}

/** Work run by the queue consumer for each event. Later steps register theirs here. */
export type EventHandler = (env: Env, event: QueuedEvent) => Promise<void>;
export const EVENT_HANDLERS: EventHandler[] = [];

/**
 * The queue consumer. Each message is handled on its own: one that fails is retried (up to
 * the queue's max_retries) without holding back the others.
 */
export async function consumeEvents(
  batch: MessageBatch<QueuedEvent>,
  env: Env,
  handlers: readonly EventHandler[] = EVENT_HANDLERS,
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
