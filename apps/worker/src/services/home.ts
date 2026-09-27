import type { Home, PageListItem } from '@clavis/shared/schema';
import type { Actor } from './actors';
import { notFound } from './errors';
import { actorRef, locatorWhere, parsePageRef } from './page-read';

/** Favorites, recently viewed pages and the home page (P1-P3, D-50, D-52). */

export const RECENT_VIEWS_KEPT = 50;

const LIST_COLUMNS = `p.id, p.short_id, p.title, p.slug, s.key AS space_key, p.doc_type, p.status,
  p.updated_at, p.updated_by, ub.name AS ub_name, ub.kind AS ub_kind`;
const LIST_FROM = `FROM pages p JOIN spaces s ON s.id = p.space_id JOIN actors ub ON ub.id = p.updated_by`;
const LIVE = 'p.deleted_at IS NULL AND s.archived_at IS NULL';

interface ListRow {
  id: string;
  short_id: string;
  title: string;
  slug: string;
  space_key: string;
  doc_type: string;
  status: string;
  updated_at: number;
  updated_by: string;
  ub_name: string;
  ub_kind: 'human' | 'agent';
  at?: number;
  open_threads?: number;
}

const toItem = (r: ListRow): PageListItem => ({
  id: r.id,
  shortId: r.short_id,
  title: r.title,
  slug: r.slug,
  spaceKey: r.space_key,
  docType: r.doc_type,
  status: r.status,
  updatedAt: r.updated_at,
  updatedBy: actorRef(r.updated_by, r.ub_name, r.ub_kind),
  ...(r.at !== undefined ? { at: r.at } : {}),
  ...(r.open_threads !== undefined ? { openThreads: r.open_threads } : {}),
});

const rows = (res: D1Result | undefined) =>
  ((res?.results ?? []) as unknown as ListRow[]).map(toItem);

function favoritesStatement(DB: D1Database, actorId: string) {
  return DB.prepare(
    `SELECT ${LIST_COLUMNS}, f.created_at AS at ${LIST_FROM}
     JOIN favorites f ON f.page_id = p.id
     WHERE f.actor_id = ? AND ${LIVE} ORDER BY f.created_at DESC LIMIT 100`,
  ).bind(actorId);
}

export async function listFavorites(DB: D1Database, actor: Actor): Promise<PageListItem[]> {
  const [res] = await DB.batch([favoritesStatement(DB, actor.id)]);
  return rows(res);
}

/** Stars or unstars a live page. Idempotent. */
export async function setFavorite(
  DB: D1Database,
  actor: Actor,
  ref: string,
  on: boolean,
  now = Date.now(),
): Promise<void> {
  const w = locatorWhere(parsePageRef(ref));
  const page = await DB.prepare(
    `SELECT p.id FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql} LIMIT 1`,
  )
    .bind(...w.binds)
    .first<{ id: string }>();
  if (!page) throw notFound('Page');
  await (on
    ? DB.prepare(
        'INSERT INTO favorites (actor_id, page_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
      ).bind(actor.id, page.id, now)
    : DB.prepare('DELETE FROM favorites WHERE actor_id = ? AND page_id = ?').bind(actor.id, page.id)
  ).run();
}

/**
 * Records that a person viewed a page, keeping their newest RECENT_VIEWS_KEPT. One D1 call,
 * meant to run after the response (waitUntil).
 */
export async function recordView(
  DB: D1Database,
  actorId: string,
  pageId: string,
  now = Date.now(),
): Promise<void> {
  await DB.batch([
    DB.prepare(
      `INSERT INTO page_views (actor_id, page_id, viewed_at) VALUES (?, ?, ?)
       ON CONFLICT (actor_id, page_id) DO UPDATE SET viewed_at = excluded.viewed_at`,
    ).bind(actorId, pageId, now),
    DB.prepare(
      `DELETE FROM page_views WHERE actor_id = ?1 AND page_id NOT IN (
         SELECT page_id FROM page_views WHERE actor_id = ?1 ORDER BY viewed_at DESC LIMIT ?2)`,
    ).bind(actorId, RECENT_VIEWS_KEPT),
  ]);
}

/** Everything on the home page in one D1 call. */
export async function getHome(DB: D1Database, actor: Actor): Promise<Home> {
  const [favRes, viewsRes, changesRes, commentsRes] = await DB.batch([
    favoritesStatement(DB, actor.id),
    DB.prepare(
      `SELECT ${LIST_COLUMNS}, v.viewed_at AS at ${LIST_FROM}
       JOIN page_views v ON v.page_id = p.id
       WHERE v.actor_id = ? AND ${LIVE} ORDER BY v.viewed_at DESC LIMIT 20`,
    ).bind(actor.id),
    DB.prepare(
      `SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE ${LIVE} ORDER BY p.updated_at DESC LIMIT 30`,
    ),
    // Owner is free text (usually an email) in the frontmatter; creator is exact.
    DB.prepare(
      `SELECT ${LIST_COLUMNS}, MAX(c.created_at) AS at, COUNT(*) AS open_threads ${LIST_FROM}
       JOIN comments c ON c.page_id = p.id AND c.id = c.thread_id AND c.resolved_at IS NULL
       WHERE ${LIVE} AND (p.owner = ? OR p.created_by = ?)
       GROUP BY p.id ORDER BY at DESC LIMIT 20`,
    ).bind(actor.email ?? actor.name, actor.id),
  ]);
  return {
    favorites: rows(favRes),
    recentViews: rows(viewsRes),
    recentChanges: rows(changesRes),
    openComments: rows(commentsRes),
  };
}
