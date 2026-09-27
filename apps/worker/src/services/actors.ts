import { and, eq, isNull, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { generateToken, hashToken, tokenPrefix } from '../auth/tokens';
import type { Db } from '../db/client';
import { actors, apiTokens } from '../db/schema';

export type Actor = typeof actors.$inferSelect;
export type Role = Actor['role'];

const LAST_USED_RESOLUTION_MS = 60 * 60 * 1000;

/**
 * Returns the human actor for an Access-authenticated email, creating it on first login.
 * The very first human becomes Admin; everyone after that starts as 'pending' (D-29 revised),
 * because Access admits any @gmail.com address.
 */
export async function findOrCreateHuman(
  d: Db,
  email: string,
  name: string | undefined,
  now: number,
) {
  const normalized = email.trim().toLowerCase();
  const existing = await d.query.actors.findFirst({ where: eq(actors.email, normalized) });
  if (existing) return existing;

  const id = ulid(now);
  // One statement decides the role, so two simultaneous first logins cannot both become Admin.
  await d.run(sql`
    INSERT INTO actors (id, kind, name, email, role, created_at)
    SELECT ${id}, 'human', ${name ?? normalized.split('@')[0]}, ${normalized},
           CASE WHEN EXISTS (SELECT 1 FROM actors WHERE kind = 'human') THEN 'pending' ELSE 'admin' END,
           ${now}
    WHERE NOT EXISTS (SELECT 1 FROM actors WHERE email = ${normalized})`);
  const created = await d.query.actors.findFirst({ where: eq(actors.email, normalized) });
  if (!created) throw new Error(`failed to create actor for ${normalized}`);
  return created;
}

/** Resolves a Bearer token to its agent actor; also records usage at most hourly. */
export async function findActorByToken(d: Db, token: string, now: number) {
  const hash = await hashToken(token);
  const row = await d
    .select({ actor: actors, tokenId: apiTokens.id, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .innerJoin(actors, eq(apiTokens.actorId, actors.id))
    .where(and(eq(apiTokens.tokenHash, hash), isNull(apiTokens.revokedAt)))
    .get();
  if (!row || row.actor.disabledAt) return null;

  const touch =
    row.lastUsedAt === null || now - row.lastUsedAt > LAST_USED_RESOLUTION_MS
      ? d.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.tokenId))
      : null;
  return { actor: row.actor, touch };
}

export async function createAgent(d: Db, name: string, role: 'editor' | 'viewer', now: number) {
  const agent = { id: ulid(now), kind: 'agent' as const, name, role, createdAt: now };
  await d.insert(actors).values(agent);
  return agent;
}

/** Issues a token for an agent. The plaintext is returned once and never stored. */
export async function issueToken(d: Db, actorId: string, now: number) {
  const token = generateToken();
  const row = {
    id: ulid(now),
    actorId,
    tokenHash: await hashToken(token),
    prefix: tokenPrefix(token),
    createdAt: now,
  };
  await d.insert(apiTokens).values(row);
  return { id: row.id, prefix: row.prefix, token };
}
