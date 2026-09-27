import type { Comment, CreateCommentInput, Thread } from '@clavis/shared/schema';
import { ulid } from 'ulid';
import type { Actor } from './actors';
import { notFound, ServiceError } from './errors';
import { actorRef, locatorWhere, parsePageRef } from './page-read';

/**
 * Page comments (D-44, D-45). Anyone who can read a page may comment; authors edit their
 * own; authors and admins delete; editors resolve threads. Comments follow their page into
 * the trash and back, and are purged with it.
 */

interface CommentRow {
  id: string;
  thread_id: string;
  body: string;
  section_id: string | null;
  created_at: number;
  updated_at: number | null;
  resolved_at: number | null;
  author_id: string;
  a_name: string;
  a_kind: 'human' | 'agent';
  resolved_by: string | null;
  r_name: string | null;
  r_kind: 'human' | 'agent' | null;
}

const toComment = (r: CommentRow): Comment => ({
  id: r.id,
  author: actorRef(r.author_id, r.a_name, r.a_kind),
  body: r.body,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** A live page by any reference: `SELECT p.id …` for use as a subquery. */
function pageTarget(ref: string) {
  const w = locatorWhere(parsePageRef(ref));
  return {
    sql: `SELECT p.id FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql} LIMIT 1`,
    binds: w.binds,
  };
}

const archived = () =>
  new ServiceError(409, 'space-archived', 'This space is archived and read-only');

/** Threads on a page, oldest first. One D1 call. */
export async function listThreads(
  DB: D1Database,
  ref: string,
  status: 'open' | 'resolved' | 'all' = 'all',
): Promise<Thread[]> {
  const t = pageTarget(ref);
  const [pageRes, rowsRes] = await DB.batch([
    DB.prepare(t.sql).bind(...t.binds),
    DB.prepare(
      `SELECT c.id, c.thread_id, c.body, c.section_id, c.created_at, c.updated_at,
              c.resolved_at, c.author_id, a.name AS a_name, a.kind AS a_kind,
              c.resolved_by, r.name AS r_name, r.kind AS r_kind
       FROM comments c JOIN actors a ON a.id = c.author_id
       LEFT JOIN actors r ON r.id = c.resolved_by
       WHERE c.page_id = (${t.sql})
       ORDER BY c.created_at, c.id`,
    ).bind(...t.binds),
  ]);
  if (!pageRes?.results.length) throw notFound('Page');
  const threads = new Map<string, Thread>();
  for (const r of (rowsRes?.results ?? []) as unknown as CommentRow[]) {
    if (r.id === r.thread_id) {
      threads.set(r.id, {
        ...toComment(r),
        sectionId: r.section_id,
        resolvedAt: r.resolved_at,
        resolvedBy:
          r.resolved_by && r.r_name && r.r_kind
            ? actorRef(r.resolved_by, r.r_name, r.r_kind)
            : null,
        replies: [],
      });
    } else {
      threads.get(r.thread_id)?.replies.push(toComment(r));
    }
  }
  const all = [...threads.values()];
  if (status === 'all') return all;
  return all.filter((th) => (status === 'open') === (th.resolvedAt === null));
}

/** Open (unresolved) threads on a page. */
export async function openThreadCount(DB: D1Database, pageId: string): Promise<number> {
  const row = await DB.prepare(
    'SELECT COUNT(*) AS n FROM comments WHERE page_id = ? AND id = thread_id AND resolved_at IS NULL',
  )
    .bind(pageId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function addComment(
  DB: D1Database,
  actor: Actor,
  ref: string,
  input: CreateCommentInput,
  now = Date.now(),
): Promise<Comment & { threadId: string }> {
  const w = locatorWhere(parsePageRef(ref));
  const [pageRes, parentRes] = await DB.batch([
    DB.prepare(
      `SELECT p.id, s.archived_at FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql} LIMIT 1`,
    ).bind(...w.binds),
    DB.prepare(
      `SELECT thread_id FROM comments WHERE id = ? AND page_id = (
         SELECT p.id FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql} LIMIT 1)`,
    ).bind(input.replyTo ?? '', ...w.binds),
  ]);
  const page = pageRes?.results[0] as { id: string; archived_at: number | null } | undefined;
  if (!page) throw notFound('Page');
  if (page.archived_at !== null) throw archived();
  let threadId: string;
  if (input.replyTo) {
    const parent = parentRes?.results[0] as { thread_id: string } | undefined;
    if (!parent) throw notFound('Comment to reply to');
    // Replies are one level deep: a reply to a reply joins the same thread.
    threadId = parent.thread_id;
  }
  const id = ulid(now);
  threadId ??= id;
  await DB.prepare(
    `INSERT INTO comments (id, page_id, thread_id, author_id, body, section_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      page.id,
      threadId,
      actor.id,
      input.body,
      input.replyTo ? null : (input.sectionId ?? null),
      now,
    )
    .run();
  return {
    id,
    threadId,
    author: actorRef(actor.id, actor.name, actor.kind),
    body: input.body,
    createdAt: now,
    updatedAt: null,
  };
}

interface Owned {
  id: string;
  thread_id: string;
  author_id: string;
  replies: number;
  archived_at: number | null;
}

/** A comment on a live page, with what the permission checks need. */
async function owned(DB: D1Database, id: string): Promise<Owned> {
  const row = await DB.prepare(
    `SELECT c.id, c.thread_id, c.author_id, s.archived_at,
            (SELECT COUNT(*) FROM comments x WHERE x.thread_id = c.id AND x.id != c.id) AS replies
     FROM comments c JOIN pages p ON p.id = c.page_id JOIN spaces s ON s.id = p.space_id
     WHERE c.id = ? AND p.deleted_at IS NULL`,
  )
    .bind(id)
    .first<Owned>();
  if (!row) throw notFound('Comment');
  if (row.archived_at !== null) throw archived();
  return row;
}

export async function updateComment(
  DB: D1Database,
  actor: Actor,
  id: string,
  body: string,
  now = Date.now(),
): Promise<void> {
  const c = await owned(DB, id);
  if (c.author_id !== actor.id) {
    throw new ServiceError(403, 'not-author', 'Only the author can edit a comment');
  }
  await DB.prepare('UPDATE comments SET body = ?, updated_at = ? WHERE id = ?')
    .bind(body, now, id)
    .run();
}

export async function deleteComment(DB: D1Database, actor: Actor, id: string): Promise<void> {
  const c = await owned(DB, id);
  if (c.author_id !== actor.id && actor.role !== 'admin') {
    throw new ServiceError(403, 'not-author', 'Only the author or an admin can delete a comment');
  }
  if (c.replies > 0) {
    throw new ServiceError(409, 'has-replies', 'This comment has replies', {
      detail: 'Resolve the thread instead of deleting it.',
    });
  }
  await DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
}

/** Resolves or reopens the thread a comment belongs to. */
export async function setResolved(
  DB: D1Database,
  actor: Actor,
  id: string,
  resolved: boolean,
  now = Date.now(),
): Promise<{ threadId: string; resolvedAt: number | null }> {
  const c = await owned(DB, id);
  const resolvedAt = resolved ? now : null;
  await DB.prepare('UPDATE comments SET resolved_at = ?, resolved_by = ? WHERE id = ?')
    .bind(resolvedAt, resolved ? actor.id : null, c.thread_id)
    .run();
  return { threadId: c.thread_id, resolvedAt };
}
