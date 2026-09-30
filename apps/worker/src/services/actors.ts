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

/** Runs of whitespace become one space, so "Adam  Kim" and "Adam Kim" are one name. */
const tidyName = (name: string) => name.trim().replace(/\s+/g, ' ');

// A name is unique ignoring case (D-68): a plain @name mention is resolved by lower(name), so
// two actors with one name would both be notified. SQLite's lower() folds ASCII only, which is
// enough for Korean (no case). Checked when a name is chosen, not by an index, because names
// taken from sign-ins before this rule may already repeat.
const nameTaken = (name: string, exceptId: string) =>
  sql`EXISTS (SELECT 1 FROM actors WHERE lower(name) = lower(${name}) AND id != ${exceptId})`;

/** Registers an agent; null when another actor already has the name. */
export async function createAgent(d: Db, name: string, role: 'editor' | 'viewer', now: number) {
  const agent = {
    id: ulid(now),
    kind: 'agent' as const,
    name: tidyName(name),
    role,
    createdAt: now,
  };
  // One statement checks and inserts, so two simultaneous registrations cannot share a name.
  const res = await d.run(sql`
    INSERT INTO actors (id, kind, name, role, created_at)
    SELECT ${agent.id}, 'agent', ${agent.name}, ${role}, ${now}
    WHERE NOT ${nameTaken(agent.name, agent.id)}`);
  return res.meta.changes > 0 ? agent : null;
}

/**
 * Renames a person or an agent. Past records show the new name, since every read joins
 * actors. Returns the stored name, or null when another actor already has it.
 */
export async function renameActor(d: Db, id: string, name: string) {
  const tidy = tidyName(name);
  const res = await d.run(sql`
    UPDATE actors SET name = ${tidy} WHERE id = ${id} AND NOT ${nameTaken(tidy, id)}`);
  return res.meta.changes > 0 ? tidy : null;
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
