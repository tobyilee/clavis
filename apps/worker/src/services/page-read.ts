import type { ActorRef, Page, PageRef } from '@clavis/shared/schema';

/**
 * Read-side SQL for pages. Services compose these statements into D1 batches, because each
 * D1 call is a subrequest (50 per request on the free plan) — one batch costs one.
 */

const SPACE_TITLE_RE = /^([A-Z][A-Z0-9]{1,9}):(.+)$/;

/** A page reference as agents and URLs give it: page id, short id, or "KEY:Title". */
export type PageLocator = { idOrShortId: string } | { spaceKey: string; title: string };

export function parsePageRef(ref: string): PageLocator {
  const trimmed = ref.trim();
  const m = SPACE_TITLE_RE.exec(trimmed);
  if (m) return { spaceKey: m[1] ?? '', title: (m[2] ?? '').trim() };
  return { idOrShortId: trimmed };
}

/** WHERE fragment (aliases p = pages, s = spaces) and its bindings for a live page. */
export function locatorWhere(loc: PageLocator): { sql: string; binds: string[] } {
  return 'idOrShortId' in loc
    ? {
        sql: '(p.id = ? OR p.short_id = ?) AND p.deleted_at IS NULL',
        binds: [loc.idOrShortId, loc.idOrShortId],
      }
    : {
        sql: 's.key = ? AND p.title = ? AND p.deleted_at IS NULL',
        binds: [loc.spaceKey, loc.title],
      };
}

export interface PageRow {
  id: string;
  short_id: string;
  space_id: string;
  space_key: string;
  space_archived_at: number | null;
  parent_id: string | null;
  position: string;
  title: string;
  slug: string;
  content: string;
  doc_type: string;
  status: string;
  owner: string | null;
  revision: number;
  created_at: number;
  updated_at: number;
  created_by: string;
  cb_name: string;
  cb_kind: 'human' | 'agent';
  updated_by: string;
  ub_name: string;
  ub_kind: 'human' | 'agent';
}

const PAGE_COLUMNS = `
  p.id, p.short_id, p.space_id, s.key AS space_key, s.archived_at AS space_archived_at,
  p.parent_id, p.position, p.title, p.slug, p.content, p.doc_type, p.status, p.owner,
  p.revision, p.created_at, p.updated_at,
  p.created_by, cb.name AS cb_name, cb.kind AS cb_kind,
  p.updated_by, ub.name AS ub_name, ub.kind AS ub_kind`;

const PAGE_FROM = `
  FROM pages p
  JOIN spaces s ON s.id = p.space_id
  JOIN actors cb ON cb.id = p.created_by
  JOIN actors ub ON ub.id = p.updated_by`;

/** The three statements that make up a full page: row, tags, ancestors (root first). */
export function pageStatements(DB: D1Database, loc: PageLocator): D1PreparedStatement[] {
  const w = locatorWhere(loc);
  const from = `FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql} LIMIT 1`;
  return [
    DB.prepare(`SELECT ${PAGE_COLUMNS} ${PAGE_FROM} WHERE ${w.sql} LIMIT 1`).bind(...w.binds),
    DB.prepare(`SELECT tag FROM page_tags WHERE page_id = (SELECT p.id ${from}) ORDER BY tag`).bind(
      ...w.binds,
    ),
    DB.prepare(
      `WITH RECURSIVE anc(id, depth) AS (
         SELECT parent_id, 1 FROM (SELECT p.parent_id ${from}) WHERE parent_id IS NOT NULL
         UNION ALL
         SELECT pp.parent_id, anc.depth + 1 FROM anc JOIN pages pp ON pp.id = anc.id
         WHERE pp.parent_id IS NOT NULL AND anc.depth < 100)
       SELECT p.id, p.short_id, p.title, p.slug FROM anc JOIN pages p ON p.id = anc.id
       ORDER BY anc.depth DESC`,
    ).bind(...w.binds),
  ];
}

interface RefRow {
  id: string;
  short_id: string;
  title: string;
  slug: string;
}

export const toPageRef = (r: RefRow): PageRef => ({
  id: r.id,
  shortId: r.short_id,
  title: r.title,
  slug: r.slug,
});

/** Assembles the results of pageStatements (in order) into a Page, or null if not found. */
export function pageFromResults(results: D1Result[]): (Page & { row: PageRow }) | null {
  const row = results[0]?.results[0] as PageRow | undefined;
  if (!row) return null;
  const tags = (results[1]?.results ?? []) as { tag: string }[];
  const ancestors = (results[2]?.results ?? []) as unknown as RefRow[];
  return {
    row,
    ...toPageRef(row),
    spaceKey: row.space_key,
    docType: row.doc_type,
    status: row.status,
    owner: row.owner,
    revision: row.revision,
    updatedAt: row.updated_at,
    updatedBy: actorRef(row.updated_by, row.ub_name, row.ub_kind),
    content: row.content,
    tags: tags.map((t) => t.tag),
    parentId: row.parent_id,
    ancestors: ancestors.map(toPageRef),
    createdAt: row.created_at,
    createdBy: actorRef(row.created_by, row.cb_name, row.cb_kind),
  };
}

export const actorRef = (id: string, name: string, kind: 'human' | 'agent'): ActorRef => ({
  id,
  name,
  kind,
});

/** Strips the internal row before a page leaves the service layer. */
export function publicPage(page: Page & { row?: PageRow }): Page {
  const { row: _row, ...rest } = page;
  return rest;
}
