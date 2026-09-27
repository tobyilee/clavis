import type { Attachment } from '@clavis/shared/schema';
import { ulid } from 'ulid';
import type { Actor } from './actors';
import { notFound, ServiceError } from './errors';
import { locatorWhere, parsePageRef } from './page-read';

/** App policy (arch §10.1); Workers accept up to 100MB request bodies on the free plan. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Attachment names are the reference key in Markdown (attachments/<name>, D-31), so keep
 * them URL- and shell-friendly: letters (any script), digits, . _ - only.
 */
export function cleanFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}._-]/gu, '')
    .replace(/^[.-]+/, '')
    .slice(-120);
  return cleaned || 'file';
}

/** arch.png → arch-1.png, arch-2.png … until free. */
export function uniqueFilename(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

interface AttachmentRow {
  id: string;
  page_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: number;
  actor_id: string;
  actor_name: string;
  actor_kind: 'human' | 'agent';
}

const toAttachment = (r: AttachmentRow): Attachment => ({
  id: r.id,
  pageId: r.page_id,
  filename: r.filename,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  createdAt: r.created_at,
  createdBy: { id: r.actor_id, name: r.actor_name, kind: r.actor_kind },
  url: `/files/${r.id}`,
});

const SELECT = `
  SELECT a.id, a.page_id, a.filename, a.mime_type, a.size_bytes, a.created_at,
         ac.id AS actor_id, ac.name AS actor_name, ac.kind AS actor_kind
  FROM attachments a JOIN actors ac ON ac.id = a.created_by`;

export async function listAttachments(DB: D1Database, ref: string): Promise<Attachment[]> {
  const w = locatorWhere(parsePageRef(ref));
  const [pageRes, listRes] = await DB.batch([
    DB.prepare(`SELECT p.id FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql}`).bind(
      ...w.binds,
    ),
    DB.prepare(
      `${SELECT} WHERE a.page_id = (SELECT p.id FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql})
       ORDER BY a.filename`,
    ).bind(...w.binds),
  ]);
  if (!pageRes?.results.length) throw notFound('Page');
  return ((listRes?.results ?? []) as unknown as AttachmentRow[]).map(toAttachment);
}

/**
 * Stores an upload. The body streams from the request straight into R2 (no buffering, so
 * almost no CPU), then the row is written; if that fails, the object is removed again.
 */
export async function uploadAttachment(
  env: Env,
  actor: Actor,
  ref: string,
  file: { name: string; type: string; size: number; body: ReadableStream },
  now = Date.now(),
): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new ServiceError(413, 'too-large', 'File is too large', {
      detail: `The limit is ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB per file.`,
    });
  }
  const { DB, FILES } = env;
  const w = locatorWhere(parsePageRef(ref));
  const [pageRes, namesRes] = await DB.batch([
    DB.prepare(
      `SELECT p.id, s.archived_at FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql}`,
    ).bind(...w.binds),
    DB.prepare(
      `SELECT filename FROM attachments WHERE page_id =
         (SELECT p.id FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${w.sql})`,
    ).bind(...w.binds),
  ]);
  const page = pageRes?.results[0] as { id: string; archived_at: number | null } | undefined;
  if (!page) throw notFound('Page');
  if (page.archived_at !== null) {
    throw new ServiceError(409, 'space-archived', 'This space is archived and read-only');
  }
  const taken = new Set(
    ((namesRes?.results ?? []) as { filename: string }[]).map((r) => r.filename),
  );
  const filename = uniqueFilename(cleanFilename(file.name), taken);
  const id = ulid(now);
  const r2Key = `att/${page.id}/${id}`;
  const mimeType = file.type || 'application/octet-stream';

  await FILES.put(r2Key, file.body, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { filename, pageId: page.id },
  });
  try {
    await DB.prepare(
      `INSERT INTO attachments (id, page_id, filename, r2_key, mime_type, size_bytes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, page.id, filename, r2Key, mimeType, file.size, actor.id, now)
      .run();
  } catch (e) {
    await FILES.delete(r2Key);
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      throw new ServiceError(409, 'filename-taken', 'Another upload took this name; try again');
    }
    throw e;
  }
  return {
    id,
    pageId: page.id,
    filename,
    mimeType,
    sizeBytes: file.size,
    createdAt: now,
    createdBy: { id: actor.id, name: actor.name, kind: actor.kind },
    url: `/files/${id}`,
  };
}

export async function deleteAttachment(env: Env, id: string): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT a.r2_key, s.archived_at FROM attachments a
     JOIN pages p ON p.id = a.page_id JOIN spaces s ON s.id = p.space_id WHERE a.id = ?`,
  )
    .bind(id)
    .first<{ r2_key: string; archived_at: number | null }>();
  if (!row) throw notFound('Attachment');
  if (row.archived_at !== null) {
    throw new ServiceError(409, 'space-archived', 'This space is archived and read-only');
  }
  await env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(id).run();
  await env.FILES.delete(row.r2_key);
}

/** For /files/{id}: the R2 key and name of an attachment on a live (not trashed) page. */
export async function fileInfo(DB: D1Database, id: string) {
  return DB.prepare(
    `SELECT a.r2_key, a.filename, a.mime_type FROM attachments a
     JOIN pages p ON p.id = a.page_id WHERE a.id = ? AND p.deleted_at IS NULL`,
  )
    .bind(id)
    .first<{ r2_key: string; filename: string; mime_type: string }>();
}
