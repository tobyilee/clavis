import { extractMentions } from '@clavis/shared/markdown';
import type { EventHandler } from '../events';
import type { Actor } from './actors';
import { notFound } from './errors';
import { actorRef, locatorWhere, parsePageRef } from './page-read';

/**
 * In-app notifications (D-57 ~ D-59), made by the event queue consumer so saves and comments
 * pay nothing for them. Who hears about a page ("watchers") is worked out when an event
 * comes in: its creator, its owner (frontmatter `owner`, by email or name), anyone who
 * commented on it, and anyone who chose to watch it — minus those who muted it. Only an
 * explicit watch or mute is stored.
 *
 * Page changes and new comments go to people; @mentions go to people and agents (D-59).
 */

export type NotificationKind = 'page.changed' | 'comment' | 'mention';

/** Read notifications are kept this long, then pruned by the nightly Cron. */
export const READ_KEPT_MS = 30 * 86_400_000;

// Bindings shared by every notification statement below.
//   ?1 page id · ?2 acting actor id · ?3 time · ?4 comment id · ?5 from revision
//   ?6 to revision · ?7 kind · ?8 mentioned ids (JSON) · ?9 mentioned names (JSON)
const WATCHERS = `
  SELECT created_by FROM pages WHERE id = ?1
  UNION SELECT x.id FROM actors x JOIN pages p ON p.id = ?1
    WHERE p.owner IS NOT NULL AND (x.email = p.owner OR x.name = p.owner)
  UNION SELECT actor_id FROM watches WHERE page_id = ?1 AND mode = 'watch'
  UNION SELECT author_id FROM comments WHERE page_id = ?1`;
const ACTIVE = `a.disabled_at IS NULL AND a.role != 'pending' AND a.id != ?2
  AND EXISTS (SELECT 1 FROM pages WHERE id = ?1 AND deleted_at IS NULL)`;
const WATCHING = `a.kind = 'human' AND a.id IN (${WATCHERS})
  AND NOT EXISTS (SELECT 1 FROM watches w
                  WHERE w.page_id = ?1 AND w.actor_id = a.id AND w.mode = 'mute')`;
const MENTIONED = `(a.id IN (SELECT value FROM json_each(?8))
  OR lower(a.name) IN (SELECT value FROM json_each(?9)))`;

/** One statement for every recipient matching `who`; unread repeats are absorbed (N5). */
function notify(DB: D1Database, who: string, binds: unknown[]): D1PreparedStatement {
  return DB.prepare(
    `INSERT INTO notifications (id, recipient_id, kind, page_id, actor_id, comment_id,
       from_revision, to_revision, count, first_at, last_at)
     SELECT lower(hex(randomblob(16))), a.id, ?7, ?1, ?2, ?4, ?5, ?6, 1, ?3, ?3
     FROM actors a WHERE ${ACTIVE} AND ${who}
     ON CONFLICT (recipient_id, kind, page_id) WHERE read_at IS NULL DO UPDATE SET
       count = count + 1, actor_id = excluded.actor_id, comment_id = excluded.comment_id,
       to_revision = excluded.to_revision, last_at = excluded.last_at`,
  ).bind(...binds);
}

export const notifyOnEvent: EventHandler = async (env, event) => {
  const DB = env.DB;
  if (event.type === 'page.saved' && (event.kind === 'update' || event.kind === 'restore')) {
    const agentEdit = `NOT (a.mute_agent_edits = 1 AND (SELECT kind FROM actors WHERE id = ?2) = 'agent')`;
    await notify(DB, `${WATCHING} AND ${agentEdit}`, [
      event.pageId,
      event.actorId,
      event.at,
      null,
      event.revision - 1,
      event.revision,
      'page.changed',
    ]).run();
    return;
  }
  if (event.type === 'comment.created') {
    const comment = await DB.prepare('SELECT body FROM comments WHERE id = ?')
      .bind(event.commentId)
      .first<{ body: string }>();
    if (!comment) return; // deleted before we got here
    const { ids, names } = extractMentions(comment.body);
    const binds = [
      event.pageId,
      event.actorId,
      event.at,
      event.commentId,
      null,
      null,
      'mention',
      JSON.stringify(ids),
      JSON.stringify(names),
    ];
    await DB.batch([
      notify(DB, MENTIONED, binds),
      // Someone mentioned hears about it once, as a mention.
      notify(DB, `${WATCHING} AND NOT ${MENTIONED}`, [
        ...binds.slice(0, 6),
        'comment',
        ...binds.slice(7),
      ]),
    ]);
  }
};

interface NotificationRow {
  id: string;
  kind: NotificationKind;
  count: number;
  first_at: number;
  last_at: number;
  read_at: number | null;
  comment_id: string | null;
  from_revision: number | null;
  to_revision: number | null;
  page_id: string;
  short_id: string;
  title: string;
  slug: string;
  space_key: string;
  actor_id: string;
  actor_name: string;
  actor_kind: 'human' | 'agent';
}

/** Newest first, with the unread count and the actor's preference. One D1 call. */
export async function listNotifications(
  DB: D1Database,
  actor: Actor,
  {
    limit = 30,
    unreadOnly = false,
    kind,
  }: { limit?: number; unreadOnly?: boolean; kind?: NotificationKind } = {},
) {
  const live = `FROM notifications n
    JOIN pages p ON p.id = n.page_id AND p.deleted_at IS NULL
    JOIN spaces s ON s.id = p.space_id
    JOIN actors a ON a.id = n.actor_id
    WHERE n.recipient_id = ?`;
  const [rowsRes, unreadRes, prefRes] = await DB.batch([
    DB.prepare(
      `SELECT n.id, n.kind, n.count, n.first_at, n.last_at, n.read_at, n.comment_id,
              n.from_revision, n.to_revision, p.id AS page_id, p.short_id, p.title, p.slug,
              s.key AS space_key, a.id AS actor_id, a.name AS actor_name, a.kind AS actor_kind
       ${live} ${unreadOnly ? 'AND n.read_at IS NULL' : ''} AND (? IS NULL OR n.kind = ?)
       ORDER BY n.last_at DESC LIMIT ?`,
    ).bind(actor.id, kind ?? null, kind ?? null, limit),
    DB.prepare(`SELECT COUNT(*) AS n ${live} AND n.read_at IS NULL`).bind(actor.id),
    DB.prepare('SELECT mute_agent_edits FROM actors WHERE id = ?').bind(actor.id),
  ]);
  const rows = (rowsRes?.results ?? []) as unknown as NotificationRow[];
  return {
    unread: (unreadRes?.results[0] as { n: number } | undefined)?.n ?? 0,
    muteAgentEdits:
      (prefRes?.results[0] as { mute_agent_edits: number } | undefined)?.mute_agent_edits === 1,
    notifications: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      page: {
        id: r.page_id,
        shortId: r.short_id,
        title: r.title,
        slug: r.slug,
        spaceKey: r.space_key,
      },
      actor: actorRef(r.actor_id, r.actor_name, r.actor_kind),
      count: r.count,
      firstAt: r.first_at,
      lastAt: r.last_at,
      readAt: r.read_at,
      commentId: r.comment_id,
      fromRevision: r.from_revision,
      toRevision: r.to_revision,
    })),
  };
}

/** Marks the given notifications (or all) read. Returns how many changed. */
export async function markRead(
  DB: D1Database,
  actor: Actor,
  ids: string[] | undefined,
  now = Date.now(),
): Promise<number> {
  const res = await DB.prepare(
    `UPDATE notifications SET read_at = ? WHERE recipient_id = ? AND read_at IS NULL
       AND (? IS NULL OR id IN (SELECT value FROM json_each(?)))`,
  )
    .bind(now, actor.id, ids ? 1 : null, JSON.stringify(ids ?? []))
    .run();
  return res.meta.changes ?? 0;
}

export async function setMuteAgentEdits(DB: D1Database, actor: Actor, mute: boolean) {
  await DB.prepare('UPDATE actors SET mute_agent_edits = ? WHERE id = ?')
    .bind(mute ? 1 : 0, actor.id)
    .run();
}

export type WatchReason = 'watch' | 'creator' | 'owner' | 'commenter';

/** Whether the actor hears about a page, and why; `muted` wins over every reason. */
export async function watchState(DB: D1Database, actor: Actor, ref: string) {
  const w = locatorWhere(parsePageRef(ref));
  const row = await DB.prepare(
    `SELECT p.id, p.created_by = ?1 AS creator,
            EXISTS (SELECT 1 FROM actors x WHERE x.id = ?1 AND p.owner IS NOT NULL
                    AND (x.email = p.owner OR x.name = p.owner)) AS owner,
            EXISTS (SELECT 1 FROM comments c WHERE c.page_id = p.id AND c.author_id = ?1) AS commenter,
            (SELECT mode FROM watches WHERE page_id = p.id AND actor_id = ?1) AS mode
     FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql} LIMIT 1`,
  )
    .bind(actor.id, ...w.binds)
    .first<{
      id: string;
      creator: number;
      owner: number;
      commenter: number;
      mode: 'watch' | 'mute' | null;
    }>();
  if (!row) throw notFound('Page');
  const reason: WatchReason | null =
    row.mode === 'watch'
      ? 'watch'
      : row.creator
        ? 'creator'
        : row.owner
          ? 'owner'
          : row.commenter
            ? 'commenter'
            : null;
  return {
    pageId: row.id,
    muted: row.mode === 'mute',
    reason,
    watching: row.mode !== 'mute' && reason !== null,
  };
}

/** Sets the explicit choice: watch, mute, or none (back to the automatic reasons). */
export async function setWatch(
  DB: D1Database,
  actor: Actor,
  ref: string,
  mode: 'watch' | 'mute' | null,
  now = Date.now(),
) {
  const { pageId } = await watchState(DB, actor, ref);
  await (mode === null
    ? DB.prepare('DELETE FROM watches WHERE actor_id = ? AND page_id = ?').bind(actor.id, pageId)
    : DB.prepare(
        `INSERT INTO watches (actor_id, page_id, mode, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (actor_id, page_id) DO UPDATE SET mode = excluded.mode`,
      ).bind(actor.id, pageId, mode, now)
  ).run();
  return watchState(DB, actor, ref);
}

/** People and agents one can @mention: everyone active. */
export async function mentionable(DB: D1Database) {
  const { results } = await DB.prepare(
    `SELECT id, name, kind FROM actors WHERE disabled_at IS NULL AND role != 'pending'
     ORDER BY kind DESC, name`,
  ).all<{ id: string; name: string; kind: 'human' | 'agent' }>();
  return results.map((r) => actorRef(r.id, r.name, r.kind));
}

/** Nightly: drops read notifications past READ_KEPT_MS. */
export async function pruneNotifications(DB: D1Database, now: number) {
  await DB.prepare('DELETE FROM notifications WHERE read_at < ?')
    .bind(now - READ_KEPT_MS)
    .run();
}
