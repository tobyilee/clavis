import type { Revision, SaveResult } from '@clavis/shared/schema';
import type { WriteOptions } from '../events';
import type { Actor } from './actors';
import { notFound, ServiceError } from './errors';
import { locatorWhere, parsePageRef } from './page-read';
import { updatePage } from './pages';

/**
 * Version history (D-54). Every save writes a page_revisions row in its own write batch and,
 * after the response, the text to R2 (events/eventSink). A page saved before history began
 * gets a `baseline` revision the first time it is saved again, so its first change can be
 * compared too.
 */

export const revisionKey = (pageId: string, revision: number) => `rev/${pageId}/${revision}.md`;

export type RevisionKind = 'create' | 'update' | 'link-rewrite' | 'restore' | 'baseline';

/**
 * Inserts rows for pages as they are now in the table. Place it after the statement that
 * wrote them. `ids` is one page id or a JSON id list (for link rewrites).
 */
export function revisionRows(
  DB: D1Database,
  where: { id: string } | { idsJson: string; actorId?: string; at?: number },
  kind: RevisionKind,
  restoredFrom: number | null = null,
): D1PreparedStatement {
  const cols = `INSERT OR IGNORE INTO page_revisions
      (page_id, revision, actor_id, created_at, title, bytes, kind, restored_from)
    SELECT id, revision, updated_by, updated_at, title, length(CAST(content AS BLOB)), ?, ?
    FROM pages`;
  if ('id' in where) return DB.prepare(`${cols} WHERE id = ?`).bind(kind, restoredFrom, where.id);
  const inList = `id IN (SELECT json_extract(value, '$.id') FROM json_each(?))`;
  // With an actor and time: only the pages this batch just wrote, as the rename does.
  return where.actorId === undefined
    ? DB.prepare(`${cols} WHERE ${inList}`).bind(kind, restoredFrom, where.idsJson)
    : DB.prepare(`${cols} WHERE updated_by = ? AND updated_at = ? AND ${inList}`).bind(
        kind,
        restoredFrom,
        where.actorId,
        where.at,
        where.idsJson,
      );
}

interface RevisionRow {
  revision: number;
  actor_id: string;
  actor_name: string;
  actor_kind: 'human' | 'agent';
  created_at: number;
  title: string;
  bytes: number;
  kind: RevisionKind;
  restored_from: number | null;
}

const toRevision = (r: RevisionRow): Revision => ({
  revision: r.revision,
  actor: { id: r.actor_id, name: r.actor_name, kind: r.actor_kind },
  at: r.created_at,
  title: r.title,
  bytes: r.bytes,
  kind: r.kind,
  restoredFrom: r.restored_from,
});

const ROW = `SELECT r.revision, r.actor_id, a.name AS actor_name, a.kind AS actor_kind,
    r.created_at, r.title, r.bytes, r.kind, r.restored_from
  FROM page_revisions r JOIN actors a ON a.id = r.actor_id`;

/** Newest first. `before` pages through older ones. */
export async function listRevisions(
  DB: D1Database,
  ref: string,
  { before, limit = 50 }: { before?: number; limit?: number } = {},
) {
  const w = locatorWhere(parsePageRef(ref));
  const page = `SELECT p.id FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql} LIMIT 1`;
  const [pageRes, rowsRes] = await DB.batch([
    DB.prepare(
      `SELECT p.id, p.revision FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql} LIMIT 1`,
    ).bind(...w.binds),
    DB.prepare(
      `${ROW} WHERE r.page_id = (${page}) AND r.revision < ? ORDER BY r.revision DESC LIMIT ?`,
    ).bind(...w.binds, before ?? Number.MAX_SAFE_INTEGER, limit + 1),
  ]);
  const current = pageRes?.results[0] as { id: string; revision: number } | undefined;
  if (!current) throw notFound('Page');
  const rows = (rowsRes?.results ?? []) as unknown as RevisionRow[];
  const revisions = rows.slice(0, limit).map(toRevision);
  const last = revisions.at(-1);
  return {
    revision: current.revision,
    revisions,
    // More rows, or none left but history does not reach revision 1: older text was never kept.
    nextBefore: rows.length > limit ? (last?.revision ?? null) : null,
    historyStart: rows.length > limit ? null : (last?.revision ?? current.revision),
  };
}

/** One revision with its text. The current revision falls back to the page itself. */
export async function readRevision(
  env: { DB: D1Database; FILES: R2Bucket },
  ref: string,
  revision: number,
) {
  const w = locatorWhere(parsePageRef(ref));
  const [pageRes, rowRes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT p.id, p.revision, p.content FROM pages p JOIN spaces s ON s.id = p.space_id
       WHERE ${w.sql} LIMIT 1`,
    ).bind(...w.binds),
    env.DB.prepare(
      `${ROW} WHERE r.page_id = (SELECT p.id FROM pages p JOIN spaces s ON s.id = p.space_id
         WHERE ${w.sql} LIMIT 1) AND r.revision = ?`,
    ).bind(...w.binds, revision),
  ]);
  const page = pageRes?.results[0] as { id: string; revision: number; content: string } | undefined;
  if (!page) throw notFound('Page');
  const row = rowRes?.results[0] as RevisionRow | undefined;
  if (!row) throw notFound('Revision');
  // The newest text is written to R2 just after the save's response; until then (and if
  // that write failed) the page row holds it.
  let content: string | null = null;
  if (revision === page.revision) content = page.content;
  else content = (await (await env.FILES.get(revisionKey(page.id, revision)))?.text()) ?? null;
  if (content === null) {
    throw new ServiceError(
      404,
      'revision-text-missing',
      `The text of revision ${revision} was not kept`,
    );
  }
  return { pageId: page.id, current: page.revision, revision: toRevision(row), content };
}

/** Saves an old revision's text as a new revision (D-56): lint, links and 409 guard apply. */
export async function restoreRevision(
  env: { DB: D1Database; FILES: R2Bucket },
  actor: Actor,
  ref: string,
  revision: number,
  baseRevision: number | undefined,
  options: WriteOptions = {},
): Promise<SaveResult> {
  const old = await readRevision(env, ref, revision);
  if (revision === old.current) {
    throw new ServiceError(400, 'already-current', `Revision ${revision} is the current one`);
  }
  return updatePage(
    env.DB,
    actor,
    old.pageId,
    { content: old.content, baseRevision: baseRevision ?? old.current },
    { ...options, restoredFrom: revision },
  );
}
