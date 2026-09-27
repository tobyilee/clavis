import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app';
import { problem } from './problem';

/**
 * Limits requests per actor, falling back to IP for unauthenticated (public) paths. Agents
 * and anonymous callers get 120/min, people 600/min (wrangler.jsonc).
 */
export function rateLimit(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const actor = c.get('actor');
    const key = actor ? `actor:${actor.id}` : `ip:${c.req.header('cf-connecting-ip') ?? 'unknown'}`;
    const limiter = actor?.kind === 'human' ? c.env.HUMAN_RATE_LIMITER : c.env.API_RATE_LIMITER;
    const { success } = await limiter.limit({ key });
    if (!success) {
      c.header('retry-after', '60');
      return problem(c, 429, 'rate-limited', 'Too many requests', {
        detail: 'Request limit exceeded. Retry after 60 seconds.',
      });
    }
    await next();
  };
}
