import { type LintDocument, parseDocument, utf8Length } from '@clavis/shared/lint';
import { renameWikiLinks } from '@clavis/shared/markdown';
import {
  type CreatePageInput,
  DOC_TYPES,
  type DocType,
  MAX_CONTENT_BYTES,
  type MovePageInput,
  type Page,
  type SaveResult,
  slugify,
  type TreeNode,
  type UpdatePageInput,
} from '@clavis/shared/schema';
import { renderTemplate } from '@clavis/shared/templates';
import { ulid } from 'ulid';
import type { Actor } from './actors';
import { notFound, ServiceError } from './errors';
import {
  type LinkTarget,
  linkTargets,
  lintForSave,
  lookupLink,
  type ResolvedLinks,
  resolvedLinks,
  resolveLinksStatement,
} from './links';
import {
  locatorWhere,
  type PageLocator,
  type PageRow,
  pageFromResults,
  pageStatements,
  parsePageRef,
  publicPage,
  savedPage,
} from './page-read';
import { positionAmong, type Sibling } from './position';

/**
 * How much a rename rewrites in other pages (D-42 revised): every rewritten page is read
 * and scanned by the Worker, so the total is capped to stay in the 10ms CPU budget. Pages
 * past the cap keep the old title and show a broken-link warning, as before.
 */
export const RENAME_LIMITS = { pages: 50, bytes: 200_000 };

// Every write below is two D1 calls: one read batch, then one write batch that also reads
// the saved page back. See docs/03-phase1-plan.md §7 for the per-request budget.

/**
 * Fails the whole batch (which D1 runs as one transaction) unless the page still has the
 * revision the caller saw. json() on invalid text is the only way to raise from plain SQL.
 */
const CONFLICT_MARKER = 'clavis-revision-conflict';
function revisionGuard(DB: D1Database, pageId: string, revision: number) {
  return DB.prepare(
    `SELECT CASE WHEN EXISTS (
       SELECT 1 FROM pages WHERE id = ? AND revision = ? AND deleted_at IS NULL)
     THEN 1 ELSE json('${CONFLICT_MARKER}') END`,
  ).bind(pageId, revision);
}

function isConstraint(e: unknown, needle: string) {
  return (
    e instanceof Error && e.message.includes('UNIQUE constraint') && e.message.includes(needle)
  );
}

const titleTaken = (title: string) =>
  new ServiceError(409, 'title-taken', `A page titled "${title}" already exists in this space`);

function assertSize(content: string) {
  if (utf8Length(content) > MAX_CONTENT_BYTES) {
    throw new ServiceError(413, 'too-large', 'Page content is too large', {
      detail: `The limit is ${MAX_CONTENT_BYTES / 1024}KB (D-33). Split the page into child pages.`,
    });
  }
}

function assertWritable(archivedAt: number | null) {
  if (archivedAt !== null) {
    throw new ServiceError(409, 'space-archived', 'This space is archived and read-only');
  }
}

/** Short id for URLs: 6 base36 characters. Collisions are caught by the unique index. */
function newShortId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

/** Frontmatter-derived columns (D-28). Only called after lint passed, so it is valid. */
function derived(doc: LintDocument) {
  const fm = doc.frontmatter;
  if (!fm) throw new Error('derived() called on content without valid frontmatter');
  return { docType: fm.type, status: fm.status, owner: fm.owner, tags: [...new Set(fm.tags)] };
}

/**
 * All of a page's links in one statement: rows travel as a JSON parameter, so a page with
 * many links costs one D1 statement instead of one each (and stays under 100 bindings).
 */
function linkRows(
  DB: D1Database,
  pageId: string,
  spaceKey: string,
  targets: LinkTarget[],
  resolved: ResolvedLinks,
) {
  if (targets.length === 0) return [];
  const rows = targets.map((t) => [
    t.spaceKey ?? spaceKey,
    t.title,
    lookupLink(resolved, t, spaceKey),
  ]);
  return [
    DB.prepare(
      `INSERT INTO page_links (from_page_id, target_space_key, target_title, to_page_id)
       SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]')
       FROM json_each(?)`,
    ).bind(pageId, JSON.stringify(rows)),
  ];
}

function tagRows(DB: D1Database, pageId: string, tags: string[]) {
  if (tags.length === 0) return [];
  return [
    DB.prepare('INSERT INTO page_tags (page_id, tag) SELECT ?, value FROM json_each(?)').bind(
      pageId,
      JSON.stringify(tags),
    ),
  ];
}

/** Links that were broken because no page had this title now point at `pageId`. */
function reconnectLinks(DB: D1Database, pageId: string, spaceKey: string, title: string) {
  return DB.prepare(
    `UPDATE page_links SET to_page_id = ?
     WHERE to_page_id IS NULL AND target_space_key = ? AND target_title = ?`,
  ).bind(pageId, spaceKey, title);
}

const bumpTree = (DB: D1Database, spaceId: string) =>
  DB.prepare('UPDATE spaces SET tree_version = tree_version + 1 WHERE id = ?').bind(spaceId);

// ── Reads ────────────────────────────────────────────────────────────────────

export async function getPage(DB: D1Database, ref: string | PageLocator): Promise<Page> {
  const loc = typeof ref === 'string' ? parsePageRef(ref) : ref;
  const page = pageFromResults(await DB.batch(pageStatements(DB, loc)));
  if (!page) throw notFound('Page');
  return publicPage(page);
}

export interface SpaceTree {
  treeVersion: number;
  /** The response body: {"treeVersion":n,"tree":[...]} as JSON text. */
  json: string;
}

/**
 * The whole tree of a space. `knownVersion` is the caller's cached tree_version (from the
 * ETag): when it still matches, nothing else is read and null is returned. Otherwise the
 * JSON cached on the space row is served; only the first read after a change rebuilds it
 * (H2: building a 500-page tree cost ~7ms CPU per request).
 */
export async function getTree(
  DB: D1Database,
  spaceKey: string,
  knownVersion?: number,
): Promise<SpaceTree | null> {
  const space = await DB.prepare(
    `SELECT id, tree_version, CASE WHEN tree_json_version = tree_version THEN tree_json END AS json
     FROM spaces WHERE key = ?`,
  )
    .bind(spaceKey.toUpperCase())
    .first<{ id: string; tree_version: number; json: string | null }>();
  if (!space) throw notFound('Space');
  if (knownVersion === space.tree_version) return null;
  if (space.json) return { treeVersion: space.tree_version, json: space.json };

  const { results } = await DB.prepare(
    `SELECT id, parent_id, short_id, title, slug, doc_type, status FROM pages
     WHERE space_id = ? AND deleted_at IS NULL ORDER BY position`,
  )
    .bind(space.id)
    .all<{
      id: string;
      parent_id: string | null;
      short_id: string;
      title: string;
      slug: string;
      doc_type: string;
      status: string;
    }>();
  const nodes = new Map<string, TreeNode>();
  for (const r of results) {
    nodes.set(r.id, {
      id: r.id,
      shortId: r.short_id,
      title: r.title,
      slug: r.slug,
      docType: r.doc_type,
      status: r.status,
      children: [],
    });
  }
  const roots: TreeNode[] = [];
  for (const r of results) {
    const node = nodes.get(r.id);
    if (!node) continue;
    const parent = r.parent_id ? nodes.get(r.parent_id) : undefined;
    // A page whose parent is gone (should not happen) still shows up, at the top level.
    (parent ? parent.children : roots).push(node);
  }
  const json = JSON.stringify({ treeVersion: space.tree_version, tree: roots });
  // Only if nothing changed meanwhile; a stale cache would otherwise outlive the change.
  await DB.prepare(
    'UPDATE spaces SET tree_json = ?, tree_json_version = ? WHERE id = ? AND tree_version = ?',
  )
    .bind(json, space.tree_version, space.id, space.tree_version)
    .run();
  return { treeVersion: space.tree_version, json };
}

/** Parsed tree, for callers that need the nodes (MCP). */
export async function getTreeNodes(DB: D1Database, spaceKey: string): Promise<TreeNode[]> {
  const result = await getTree(DB, spaceKey);
  return result ? (JSON.parse(result.json) as { tree: TreeNode[] }).tree : [];
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createPage(
  DB: D1Database,
  actor: Actor,
  spaceKey: string,
  input: CreatePageInput,
  now = Date.now(),
): Promise<SaveResult> {
  const key = spaceKey.toUpperCase();
  let content = input.content;
  if (content === undefined) {
    const type = (input.template ?? 'note') as DocType;
    if (!DOC_TYPES.includes(type)) {
      throw new ServiceError(400, 'invalid-template', `Unknown template "${input.template}"`);
    }
    content = renderTemplate(type, { owner: actor.email ?? actor.name });
  }
  assertSize(content);
  // Parsed once: link extraction, lint and the derived columns share it (H2: a 100KB save
  // scanned the page three times).
  const doc = parseDocument(content);
  const targets = linkTargets(doc, key);
  const parentRef = input.parent ?? null;

  const [spaceRes, parentRes, siblingsRes, titleRes, linksRes] = await DB.batch([
    DB.prepare('SELECT id, archived_at FROM spaces WHERE key = ?').bind(key),
    DB.prepare(
      `SELECT p.id FROM pages p JOIN spaces s ON s.id = p.space_id
       WHERE (p.id = ? OR p.short_id = ?) AND s.key = ? AND p.deleted_at IS NULL`,
    ).bind(parentRef ?? '', parentRef ?? '', key),
    DB.prepare(
      `SELECT p.id, p.short_id, p.position FROM pages p JOIN spaces s ON s.id = p.space_id
       WHERE s.key = ? AND p.deleted_at IS NULL AND p.parent_id IS (
         SELECT id FROM pages WHERE (id = ? OR short_id = ?) AND deleted_at IS NULL)`,
    ).bind(key, parentRef ?? '', parentRef ?? ''),
    DB.prepare(
      `SELECT 1 FROM pages p JOIN spaces s ON s.id = p.space_id
       WHERE s.key = ? AND p.title = ? AND p.deleted_at IS NULL`,
    ).bind(key, input.title),
    resolveLinksStatement(DB, targets),
  ]);
  const space = spaceRes?.results[0] as { id: string; archived_at: number | null } | undefined;
  if (!space) throw notFound('Space');
  assertWritable(space.archived_at);
  const parent = parentRes?.results[0] as { id: string } | undefined;
  if (parentRef && !parent) throw notFound('Parent page');
  if (titleRes?.results.length) throw titleTaken(input.title);

  const resolved = resolvedLinks(linksRes);
  // A new page has no attachments yet, so any attachments/ reference is an error.
  const violations = lintForSave(doc, key, resolved, new Set());
  const fm = derived(doc);
  const position = positionAmong((siblingsRes?.results ?? []) as unknown as Sibling[], {
    after: input.after,
  });

  const id = ulid(now);
  for (let attempt = 0; ; attempt++) {
    const shortId = newShortId();
    try {
      const results = await DB.batch([
        DB.prepare(
          `INSERT INTO pages (id, short_id, space_id, parent_id, position, title, slug, content,
             doc_type, status, owner, revision, created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        ).bind(
          id,
          shortId,
          space.id,
          parent?.id ?? null,
          position,
          input.title,
          slugify(input.title),
          content,
          fm.docType,
          fm.status,
          fm.owner,
          actor.id,
          actor.id,
          now,
          now,
        ),
        ...tagRows(DB, id, fm.tags),
        ...linkRows(DB, id, key, targets, resolved),
        reconnectLinks(DB, id, key, input.title),
        bumpTree(DB, space.id),
        ...pageStatements(DB, { idOrShortId: id }, { withContent: false }),
      ]);
      const page = pageFromResults(results.slice(-3));
      if (!page) throw new Error('created page not found');
      return { page: savedPage(page), violations };
    } catch (e) {
      if (isConstraint(e, 'short_id') && attempt < 3) continue;
      if (isConstraint(e, 'title')) throw titleTaken(input.title);
      throw e;
    }
  }
}

// ── Update ───────────────────────────────────────────────────────────────────

export async function updatePage(
  DB: D1Database,
  actor: Actor,
  ref: string,
  input: UpdatePageInput,
  now = Date.now(),
): Promise<SaveResult> {
  assertSize(input.content);
  const loc = parsePageRef(ref);
  const w = locatorWhere(loc);
  // Everything below is keyed by a subquery on the page, so one batch reads it all even
  // though the page's id and space are not known yet.
  const target = (col: string) =>
    `SELECT p.${col} FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql} LIMIT 1`;
  const doc = parseDocument(input.content);
  const targets = linkTargets(doc, null);
  const [pageRes, tagsRes, ancRes, linksRes, attRes, titleRes, incomingRes, refRes] =
    await DB.batch([
      ...pageStatements(DB, loc, { withContent: false }),
      resolveLinksStatement(DB, targets, {
        sql: `SELECT s.key FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql} LIMIT 1`,
        binds: w.binds,
      }),
      DB.prepare(`SELECT filename FROM attachments WHERE page_id = (${target('id')})`).bind(
        ...w.binds,
      ),
      DB.prepare(
        `SELECT 1 FROM pages WHERE space_id = (${target('space_id')}) AND title = ?
       AND id != (${target('id')}) AND deleted_at IS NULL`,
      ).bind(...w.binds, input.title ?? '', ...w.binds),
      DB.prepare(
        `SELECT COUNT(DISTINCT from_page_id) AS n FROM page_links
       WHERE to_page_id = (${target('id')}) AND from_page_id != to_page_id`,
      ).bind(...w.binds),
      // Pages linking here, with content, up to the rewrite cap — only when the title changes
      // (NULL != x is not true, so no title means no rows).
      DB.prepare(
        `SELECT id, space_key, revision, content FROM (
         SELECT p.id, s.key AS space_key, p.revision, p.content,
                ROW_NUMBER() OVER (ORDER BY p.id) AS n,
                SUM(length(CAST(p.content AS BLOB))) OVER (ORDER BY p.id) AS running
         FROM pages p JOIN spaces s ON s.id = p.space_id
         WHERE p.id IN (SELECT from_page_id FROM page_links WHERE to_page_id = (${target('id')}))
           AND p.id != (${target('id')}) AND p.deleted_at IS NULL AND s.archived_at IS NULL
           AND ? != (${target('title')}))
       WHERE n <= ? AND running <= ?`,
      ).bind(
        ...w.binds,
        ...w.binds,
        input.title ?? null,
        ...w.binds,
        RENAME_LIMITS.pages,
        RENAME_LIMITS.bytes,
      ),
    ]);
  const current = pageFromResults([pageRes, tagsRes, ancRes] as D1Result[]);
  if (!current) throw notFound('Page');
  const row = current.row;
  assertWritable(row.space_archived_at);
  if (row.revision !== input.baseRevision) throw conflict(row.revision);

  const title = input.title ?? row.title;
  const renamed = title !== row.title;
  if (renamed && titleRes?.results.length) throw titleTaken(title);

  const resolved = resolvedLinks(linksRes);
  const attachments = new Set(
    ((attRes?.results ?? []) as { filename: string }[]).map((a) => a.filename),
  );
  const violations = lintForSave(doc, row.space_key, resolved, attachments);
  const fm = derived(doc);
  const treeChanged = renamed || fm.docType !== row.doc_type || fm.status !== row.status;

  // Rewrite [[old title]] in the pages that link here (D-42 revised).
  const rewrites: { id: string; rev: number; content: string }[] = [];
  if (renamed) {
    const rename = { spaceKey: row.space_key, oldTitle: row.title, newTitle: title };
    for (const ref of (refRes?.results ?? []) as {
      id: string;
      space_key: string;
      revision: number;
      content: string;
    }[]) {
      const out = renameWikiLinks(ref.content, ref.space_key, rename);
      if (out.count > 0) rewrites.push({ id: ref.id, rev: ref.revision, content: out.content });
    }
  }

  try {
    const results = await DB.batch([
      revisionGuard(DB, row.id, input.baseRevision),
      DB.prepare(
        `UPDATE pages SET title = ?, slug = ?, content = ?, doc_type = ?, status = ?, owner = ?,
           revision = revision + 1, updated_by = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(
        title,
        slugify(title),
        input.content,
        fm.docType,
        fm.status,
        fm.owner,
        actor.id,
        now,
        row.id,
      ),
      DB.prepare('DELETE FROM page_tags WHERE page_id = ?').bind(row.id),
      ...tagRows(DB, row.id, fm.tags),
      DB.prepare('DELETE FROM page_links WHERE from_page_id = ?').bind(row.id),
      ...linkRows(DB, row.id, row.space_key, targets, resolved),
      ...(renamed ? renameStatements(DB, actor, row, title, rewrites, now) : []),
      ...(treeChanged ? [bumpTree(DB, row.space_id)] : []),
      ...pageStatements(DB, { idOrShortId: row.id }, { withContent: false }),
    ]);
    const page = pageFromResults(results.slice(-3));
    if (!page) throw new Error('updated page not found');
    const incoming = (incomingRes?.results[0] as { n: number } | undefined)?.n ?? 0;
    // Rewrites that lost a race with another save were skipped by their revision check.
    const updated = renamed ? await countRewritten(DB, rewrites, actor, now) : 0;
    return {
      page: savedPage(page),
      violations,
      ...(renamed ? { linksUpdated: updated, linksToOldTitle: incoming - updated } : {}),
    };
  } catch (e) {
    if (e instanceof Error && e.message.includes('malformed JSON')) {
      // Someone saved in between our read and write; report their revision.
      const latest = await DB.prepare('SELECT revision FROM pages WHERE id = ?')
        .bind(row.id)
        .first<{ revision: number }>();
      throw conflict(latest?.revision ?? row.revision + 1);
    }
    if (isConstraint(e, 'title')) throw titleTaken(title);
    throw e;
  }
}

/**
 * The rename's link work, as a fixed number of statements however many pages link here
 * (D1 allows 50 queries per request): the rewritten pages go in as one JSON parameter.
 */
function renameStatements(
  DB: D1Database,
  actor: Actor,
  row: PageRow,
  newTitle: string,
  rewrites: { id: string; rev: number; content: string }[],
  now: number,
): D1PreparedStatement[] {
  const json = JSON.stringify(rewrites);
  // A page counts as rewritten only if this batch just wrote it (same actor and time).
  const rewritten = `SELECT json_extract(j.value, '$.id') FROM json_each(?) j
     JOIN pages p ON p.id = json_extract(j.value, '$.id')
     WHERE p.updated_by = ? AND p.updated_at = ?`;
  return [
    ...(rewrites.length > 0
      ? [
          DB.prepare(
            `UPDATE pages SET
               content = (SELECT json_extract(j.value, '$.content') FROM json_each(?1) j
                          WHERE json_extract(j.value, '$.id') = pages.id),
               revision = revision + 1, updated_by = ?2, updated_at = ?3
             WHERE deleted_at IS NULL AND EXISTS (
               SELECT 1 FROM json_each(?1) j
               WHERE json_extract(j.value, '$.id') = pages.id AND json_extract(j.value, '$.rev') = pages.revision)`,
          ).bind(json, actor.id, now),
          // A rewritten page may already hold a (broken) link to the new title.
          DB.prepare(
            `DELETE FROM page_links WHERE target_space_key = ? AND target_title = ?
               AND from_page_id IN (${rewritten})`,
          ).bind(row.space_key, newTitle, json, actor.id, now),
          DB.prepare(
            `UPDATE page_links SET target_title = ?
             WHERE to_page_id = ? AND target_title = ? AND from_page_id IN (${rewritten})`,
          ).bind(newTitle, row.id, row.title, json, actor.id, now),
        ]
      : []),
    // Links not rewritten (over the cap, archived, raced) break, as before.
    DB.prepare(
      'UPDATE page_links SET to_page_id = NULL WHERE to_page_id = ? AND target_title = ?',
    ).bind(row.id, row.title),
    reconnectLinks(DB, row.id, row.space_key, newTitle),
  ];
}

async function countRewritten(
  DB: D1Database,
  rewrites: { id: string }[],
  actor: Actor,
  now: number,
): Promise<number> {
  if (rewrites.length === 0) return 0;
  const row = await DB.prepare(
    `SELECT COUNT(*) AS n FROM pages WHERE updated_by = ? AND updated_at = ?
       AND id IN (SELECT json_extract(value, '$.id') FROM json_each(?))`,
  )
    .bind(actor.id, now, JSON.stringify(rewrites))
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function conflict(revision: number) {
  return new ServiceError(409, 'revision-conflict', 'The page was changed by someone else', {
    detail: `Current revision is ${revision}. Read the page again and reapply your change.`,
    revision,
  });
}

// ── Move ─────────────────────────────────────────────────────────────────────

export async function movePage(
  DB: D1Database,
  actor: Actor,
  ref: string,
  input: MovePageInput,
  now = Date.now(),
): Promise<Page> {
  const loc = parsePageRef(ref);
  const current = pageFromResults(await DB.batch(pageStatements(DB, loc)));
  if (!current) throw notFound('Page');
  const row: PageRow = current.row;
  assertWritable(row.space_archived_at);

  const keepParent = input.parent === undefined;
  const parentRef = input.parent ?? null;
  const [parentRes, siblingsRes, subtreeRes] = await DB.batch([
    DB.prepare(
      `SELECT id FROM pages WHERE (id = ? OR short_id = ?) AND space_id = ? AND deleted_at IS NULL`,
    ).bind(parentRef ?? '', parentRef ?? '', row.space_id),
    keepParent
      ? DB.prepare(
          'SELECT id, short_id, position FROM pages WHERE space_id = ? AND parent_id IS ? AND deleted_at IS NULL',
        ).bind(row.space_id, row.parent_id)
      : DB.prepare(
          `SELECT id, short_id, position FROM pages
           WHERE space_id = ? AND deleted_at IS NULL AND parent_id IS (
             SELECT id FROM pages WHERE (id = ? OR short_id = ?) AND space_id = ? AND deleted_at IS NULL)`,
        ).bind(row.space_id, parentRef ?? '', parentRef ?? '', row.space_id),
    subtreeStatement(DB, row.id),
  ]);

  let parentId = row.parent_id;
  if (!keepParent) {
    const parent = parentRes?.results[0] as { id: string } | undefined;
    if (parentRef && !parent) throw notFound('Parent page');
    parentId = parent?.id ?? null;
    const subtree = new Set(((subtreeRes?.results ?? []) as { id: string }[]).map((r) => r.id));
    if (parentId && subtree.has(parentId)) {
      throw new ServiceError(
        400,
        'invalid-move',
        'A page cannot move under itself or its children',
      );
    }
  }
  const position = positionAmong(
    (siblingsRes?.results ?? []) as unknown as Sibling[],
    { after: input.after, before: input.before },
    row.id,
  );

  // Moving is not an edit of the page's content, so the revision stays the same.
  const results = await DB.batch([
    DB.prepare(
      'UPDATE pages SET parent_id = ?, position = ?, updated_by = ?, updated_at = ? WHERE id = ?',
    ).bind(parentId, position, actor.id, now, row.id),
    bumpTree(DB, row.space_id),
    ...pageStatements(DB, { idOrShortId: row.id }),
  ]);
  const page = pageFromResults(results.slice(-3));
  if (!page) throw new Error('moved page not found');
  return publicPage(page);
}

/** The page and all its live descendants. */
function subtreeStatement(DB: D1Database, pageId: string) {
  return DB.prepare(
    `WITH RECURSIVE sub(id) AS (
       SELECT ? UNION ALL
       SELECT p.id FROM pages p JOIN sub ON p.parent_id = sub.id WHERE p.deleted_at IS NULL)
     SELECT id FROM sub`,
  ).bind(pageId);
}

// ── Delete (to trash) ────────────────────────────────────────────────────────

export async function deletePage(
  DB: D1Database,
  actor: Actor,
  ref: string,
  now = Date.now(),
): Promise<{ batchId: string; pageCount: number }> {
  const w = locatorWhere(parsePageRef(ref));
  const [pageRes, subtreeRes] = await DB.batch([
    DB.prepare(
      `SELECT p.id, p.space_id, s.archived_at, s.home_page_id FROM pages p
       JOIN spaces s ON s.id = p.space_id WHERE ${w.sql}`,
    ).bind(...w.binds),
    DB.prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT p.id FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql}
         UNION ALL
         SELECT p.id FROM pages p JOIN sub ON p.parent_id = sub.id WHERE p.deleted_at IS NULL)
       SELECT id FROM sub`,
    ).bind(...w.binds),
  ]);
  const page = pageRes?.results[0] as
    | { id: string; space_id: string; archived_at: number | null; home_page_id: string | null }
    | undefined;
  if (!page) throw notFound('Page');
  assertWritable(page.archived_at);
  if (page.home_page_id === page.id) {
    throw new ServiceError(409, 'home-page', 'The space home page cannot be deleted', {
      detail: 'Choose another home page for the space first.',
    });
  }
  const ids = ((subtreeRes?.results ?? []) as { id: string }[]).map((r) => r.id);
  const batchId = ulid(now);
  const idsJson = JSON.stringify(ids);
  await DB.batch([
    DB.prepare(
      `UPDATE pages SET deleted_at = ?, deleted_batch = ?, deleted_by = ?
       WHERE id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL`,
    ).bind(now, batchId, actor.id, idsJson),
    // Links into the trash become broken links until the pages are restored.
    DB.prepare(
      'UPDATE page_links SET to_page_id = NULL WHERE to_page_id IN (SELECT value FROM json_each(?))',
    ).bind(idsJson),
    bumpTree(DB, page.space_id),
  ]);
  return { batchId, pageCount: ids.length };
}
