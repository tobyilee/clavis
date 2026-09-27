import type { MiddlewareHandler } from 'hono';
import { problem } from '../api/problem';
import type { AppEnv } from '../app';
import { db } from '../db/client';
import { findActorByToken, findOrCreateHuman, type Role } from '../services/actors';
import { accessIdentity } from './access';
import { looksLikeToken } from './tokens';

/**
 * Identifies the caller. Cloudflare Access has already admitted the request at the edge
 * (a Google login, or an agent's service token); this decides *who* it is inside Clavis:
 *   Authorization: Bearer clv_…  → agent actor
 *   Access identity (ctx.access or the Access JWT) → human actor, created on first login
 */
export function authenticate(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const d = db(c.env.DB);
    const now = Date.now();

    const auth = c.req.header('authorization');
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice('Bearer '.length).trim();
      const found = looksLikeToken(token) ? await findActorByToken(d, token, now) : null;
      if (!found) return problem(c, 401, 'invalid-token', 'Invalid or revoked API token');
      if (found.touch) c.executionCtx.waitUntil(found.touch.run());
      c.set('actor', found.actor);
      return next();
    }

    // Hono's ExecutionContext type predates ctx.access; read it through the Workers runtime type.
    const ctx = c.executionCtx as unknown as ExecutionContext;
    const identity = await accessIdentity(
      ctx,
      { url: c.req.url, jwtHeader: c.req.header('cf-access-jwt-assertion') },
      c.env,
    );
    if (!identity) return problem(c, 401, 'unauthenticated', 'Authentication required');
    const actor = await findOrCreateHuman(d, identity.email, identity.name, now);
    if (actor.disabledAt) return problem(c, 403, 'disabled', 'This account is disabled');
    c.set('actor', actor);
    return next();
  };
}

const RANK: Record<Role, number> = { pending: 0, viewer: 1, editor: 2, admin: 3 };

export function requireRole(min: Exclude<Role, 'pending'>): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const { role } = c.get('actor');
    if (role === 'pending') {
      return problem(c, 403, 'approval-pending', 'Your account is waiting for Admin approval');
    }
    if (RANK[role] < RANK[min]) {
      return problem(c, 403, 'forbidden', `This action requires the ${min} role`);
    }
    return next();
  };
}
