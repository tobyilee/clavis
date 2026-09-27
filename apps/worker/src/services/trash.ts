import type { TrashEntry } from '@clavis/shared/schema';
import { generateKeyBetween } from 'fractional-indexing';
import type { Actor } from './actors';
import { notFound, ServiceError } from './errors';
import { toPageRef } from './page-read';

/** How long trashed pages are kept before the nightly purge (D-36). */
export const TRASH_RETENTION_MS = 30 * 86_400_000;

interface TrashRow {
  batch_id: string;
  space_key: string;
  id: string;
  short_id: string;
  title: string;
  slug: string;
  deleted_at: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_kind: 'human' | 'agent' | null;
  page_count: number;
}

/** One entry per deleted subtree, newest first. The root is the page the user deleted. */
export async function listTrash(DB: D1Database, spaceKey?: string): Promise<TrashEntry[]> {
  const { results } = await DB.prepare(
    `SELECT r.deleted_batch AS batch_id, s.key AS space_key, r.id, r.short_id, r.title, r.slug,
            r.deleted_at, a.id AS actor_id, a.name AS actor_name, a.kind AS actor_kind,
            (SELECT COUNT(*) FROM pages c WHERE c.deleted_batch = r.deleted_batch) AS page_count
     FROM pages r
     JOIN spaces s ON s.id = r.space_id
     LEFT JOIN actors a ON a.id = r.deleted_by
     WHERE r.deleted_batch IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pages pp
                       WHERE pp.id = r.parent_id AND pp.deleted_batch = r.deleted_batch)
       AND (?1 IS NULL OR s.key = ?1)
     ORDER BY r.deleted_at DESC
     LIMIT 200`,
  )
    .bind(spaceKey?.toUpperCase() ?? null)
    .all<TrashRow>();
  return results.map((r) => ({
    batchId: r.batch_id,
    spaceKey: r.space_key,
    root: toPageRef(r),
    pageCount: r.page_count,
    deletedAt: r.deleted_at,
    deletedBy:
      r.actor_id && r.actor_name && r.actor_kind
        ? { id: r.actor_id, name: r.actor_name, kind: r.actor_kind }
        : null,
  }));
}

/**
 * Restores a deleted subtree. If the root's parent is gone, the root returns at the top
 * level; titles now used by live pages get a " (restored)" suffix to stay unique.
 */
export async function restoreBatch(
  DB: D1Database,
  actor: Actor,
  batchId: string,
  now = Date.now(),
): Promise<{ restored: number; renamed: { id: string; title: string }[] }> {
  const [pagesRes, takenRes, rootsRes] = await DB.batch([
    DB.prepare(
      `SELECT p.id, p.title, p.parent_id, p.space_id, s.key AS space_key, s.archived_at,
              (SELECT deleted_at FROM pages pp WHERE pp.id = p.parent_id) AS parent_deleted_at,
              (SELECT 1 FROM pages pp WHERE pp.id = p.parent_id) AS parent_exists
       FROM pages p JOIN spaces s ON s.id = p.space_id WHERE p.deleted_batch = ?`,
    ).bind(batchId),
    DB.prepare(
      `SELECT title FROM pages WHERE deleted_at IS NULL AND space_id =
         (SELECT space_id FROM pages WHERE deleted_batch = ? LIMIT 1)`,
    ).bind(batchId),
    DB.prepare(
      `SELECT MAX(position) AS last FROM pages WHERE parent_id IS NULL AND deleted_at IS NULL
         AND space_id = (SELECT space_id FROM pages WHERE deleted_batch = ? LIMIT 1)`,
    ).bind(batchId),
  ]);
  type Row = {
    id: string;
    title: string;
    parent_id: string | null;
    space_id: string;
    space_key: string;
    archived_at: number | null;
    parent_deleted_at: number | null;
    parent_exists: number | null;
  };
  const rows = (pagesRes?.results ?? []) as unknown as Row[];
  if (rows.length === 0) throw notFound('Trash entry');
  const first = rows[0] as Row;
  if (first.archived_at !== null) {
    throw new ServiceError(409, 'space-archived', 'This space is archived and read-only');
  }

  const taken = new Set(((takenRes?.results ?? []) as { title: string }[]).map((r) => r.title));
  const renamed: { id: string; title: string }[] = [];
  for (const r of rows) {
    if (!taken.has(r.title)) {
      taken.add(r.title);
      continue;
    }
    let title = `${r.title} (restored)`;
    for (let n = 2; taken.has(title); n++) title = `${r.title} (restored ${n})`;
    taken.add(title);
    renamed.push({ id: r.id, title });
  }

  const ids = new Set(rows.map((r) => r.id));
  // Roots whose parent is not coming back with them (deleted separately, or purged).
  const orphans = rows.filter(
    (r) => r.parent_id && !ids.has(r.parent_id) && (!r.parent_exists || r.parent_deleted_at),
  );
  let last = (rootsRes?.results[0] as { last: string | null } | undefined)?.last ?? null;
  const reparent = orphans.map((r) => {
    let position: string;
    try {
      position = generateKeyBetween(last, null);
    } catch {
      position = `${last ?? 'a'}V`;
    }
    last = position;
    return DB.prepare('UPDATE pages SET parent_id = NULL, position = ? WHERE id = ?').bind(
      position,
      r.id,
    );
  });

  const idsJson = JSON.stringify([...ids]);
  await DB.batch([
    ...renamed.map((r) =>
      DB.prepare('UPDATE pages SET title = ?, updated_by = ?, updated_at = ? WHERE id = ?').bind(
        r.title,
        actor.id,
        now,
        r.id,
      ),
    ),
    ...reparent,
    DB.prepare(
      'UPDATE pages SET deleted_at = NULL, deleted_batch = NULL, deleted_by = NULL WHERE deleted_batch = ?',
    ).bind(batchId),
    // Links that broke when these pages were trashed (or were always broken) resolve again.
    DB.prepare(
      `UPDATE page_links SET to_page_id = p.id
       FROM pages p JOIN spaces s ON s.id = p.space_id
       WHERE page_links.to_page_id IS NULL
         AND page_links.target_space_key = s.key AND page_links.target_title = p.title
         AND p.id IN (SELECT value FROM json_each(?))`,
    ).bind(idsJson),
    DB.prepare('UPDATE spaces SET tree_version = tree_version + 1 WHERE id = ?').bind(
      first.space_id,
    ),
  ]);
  return { restored: rows.length, renamed };
}

/**
 * Permanently deletes pages trashed more than 30 days ago (D-36), a bounded number per call
 * so it fits the Cron budget; later runs continue. Returns the number of pages purged.
 */
export async function purgeTrash(
  DB: D1Database,
  bucket: R2Bucket,
  now: number,
  limit = 50,
): Promise<number> {
  const cutoff = now - TRASH_RETENTION_MS;
  const [pagesRes, attRes] = await DB.batch([
    DB.prepare('SELECT id FROM pages WHERE deleted_at < ? ORDER BY deleted_at LIMIT ?').bind(
      cutoff,
      limit,
    ),
    DB.prepare(
      `SELECT r2_key FROM attachments WHERE page_id IN (
         SELECT id FROM pages WHERE deleted_at < ? ORDER BY deleted_at LIMIT ?)`,
    ).bind(cutoff, limit),
  ]);
  const ids = ((pagesRes?.results ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return 0;
  const keys = ((attRes?.results ?? []) as { r2_key: string }[]).map((r) => r.r2_key);
  // R2 first: if the DB step then fails, the next run retries and deleting again is harmless.
  if (keys.length > 0) await bucket.delete(keys);
  const idsJson = JSON.stringify(ids);
  const inIds = 'IN (SELECT value FROM json_each(?))';
  await DB.batch([
    DB.prepare(`DELETE FROM attachments WHERE page_id ${inIds}`).bind(idsJson),
    DB.prepare(`DELETE FROM page_tags WHERE page_id ${inIds}`).bind(idsJson),
    DB.prepare(`DELETE FROM page_lint WHERE page_id ${inIds}`).bind(idsJson),
    DB.prepare(`DELETE FROM comments WHERE page_id ${inIds}`).bind(idsJson),
    DB.prepare(`DELETE FROM page_links WHERE from_page_id ${inIds}`).bind(idsJson),
    DB.prepare(`UPDATE page_links SET to_page_id = NULL WHERE to_page_id ${inIds}`).bind(idsJson),
    DB.prepare(`UPDATE spaces SET home_page_id = NULL WHERE home_page_id ${inIds}`).bind(idsJson),
    DB.prepare(`DELETE FROM pages WHERE id ${inIds}`).bind(idsJson),
  ]);
  return ids.length;
}
