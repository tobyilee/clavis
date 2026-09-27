import { createTar } from './tar';

// Nightly backup (D-30), chunked across several Cron runs. The free plan allows 10ms CPU
// and 50 subrequests per run, and S6 measured ~0.02ms CPU per KB of page content, so each
// run archives the next ~150KB of pages into its own tar part and records a cursor in R2.
//
//   backup/{date}/state.json      cursor and progress
//   backup/{date}/part-001.tar    SPACE/<parent>--<id>/<title>--<id>.md ...
//   backup/{date}/meta.json       spaces, actors, attachments, page metadata (written last)
//
// Extracting every part into one directory rebuilds the full tree.

export const BACKUP_PREFIX = 'backup/';
export const RETENTION_DAYS = 14;
export const DEFAULT_CHUNK_BYTES = 150_000;

interface SpaceRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  home_page_id: string | null;
  created_at: number;
  archived_at: number | null;
}
/** The columns path building needs; loaded for every page on every run, so keep it narrow. */
interface PathRow {
  id: string;
  short_id: string;
  space_id: string;
  parent_id: string | null;
  title: string;
  deleted_at: number | null;
}
/** Full page metadata, loaded once in the final run for meta.json. */
interface PageMetaRow extends PathRow {
  position: string;
  slug: string;
  doc_type: string;
  status: string;
  owner: string | null;
  revision: number;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
  deleted_batch: string | null;
}
interface ChunkRow {
  rowid: number;
  id: string;
  content: string;
  updated_at: number;
}

export interface BackupState {
  date: string;
  cursor: number;
  parts: number;
  pages: number;
  bytes: number;
  done: boolean;
  startedAt: string;
  finishedAt?: string;
}

export interface BackupStepResult {
  state: BackupState;
  wrote: string | null;
  pruned: string[];
}

/** Runs one step of tonight's backup. Safe to call repeatedly; finished nights are a no-op. */
export async function runBackupStep(
  env: Env,
  now: Date,
  chunkBytes = DEFAULT_CHUNK_BYTES,
): Promise<BackupStepResult> {
  const date = now.toISOString().slice(0, 10);
  const dir = `${BACKUP_PREFIX}${date}/`;
  const stateKey = `${dir}state.json`;

  const stored = await env.FILES.get(stateKey);
  const state: BackupState = stored
    ? await stored.json()
    : { date, cursor: 0, parts: 0, pages: 0, bytes: 0, done: false, startedAt: now.toISOString() };
  if (state.done) return { state, wrote: null, pruned: [] };

  const [spaces, pathInfo, last, chunk] = await env.DB.batch([
    // Explicit columns: the cached tree JSON is derived data and stays out of backups.
    env.DB.prepare(
      'SELECT id, key, name, description, home_page_id, created_at, archived_at FROM spaces ORDER BY key',
    ),
    env.DB.prepare('SELECT id, short_id, space_id, parent_id, title, deleted_at FROM pages'),
    env.DB.prepare('SELECT MAX(rowid) AS max FROM pages'),
    // The size cut runs inside D1, so the Worker never decodes more rows than it archives.
    // The first row is always included, even when it alone exceeds the budget.
    env.DB.prepare(
      `SELECT rowid, id, content, updated_at FROM (
         SELECT rowid, id, content, updated_at,
                SUM(length(CAST(content AS BLOB))) OVER (ORDER BY rowid) AS running
         FROM pages WHERE rowid > ?1)
       WHERE running - length(CAST(content AS BLOB)) < ?2
       ORDER BY rowid`,
    ).bind(state.cursor, chunkBytes),
  ]);
  const spaceRows = (spaces?.results ?? []) as unknown as SpaceRow[];
  const pathRows = (pathInfo?.results ?? []) as unknown as PathRow[];
  const chunkRows = (chunk?.results ?? []) as unknown as ChunkRow[];
  const maxRowid = (last?.results?.[0] as { max: number | null } | undefined)?.max ?? 0;
  const paths = pagePaths(spaceRows, pathRows);

  let wrote: string | null = null;
  if (chunkRows.length > 0) {
    state.parts += 1;
    wrote = `${dir}part-${String(state.parts).padStart(3, '0')}.tar`;
    const tar = createTar(
      chunkRows.map((p) => ({
        path: paths.get(p.id) ?? `_orphans/${p.id}.md`,
        content: p.content,
        mtime: new Date(p.updated_at),
      })),
    );
    await env.FILES.put(wrote, tar);
    state.cursor = chunkRows.at(-1)?.rowid ?? state.cursor;
    state.pages += chunkRows.length;
    state.bytes += tar.size;
  }

  const exhausted = state.cursor >= maxRowid;
  let pruned: string[] = [];
  if (exhausted) {
    const [pageMeta, actors, attachments] = await env.DB.batch([
      env.DB.prepare(
        `SELECT id, short_id, space_id, parent_id, position, title, slug, doc_type, status, owner,
                revision, created_by, updated_by, created_at, updated_at, deleted_at, deleted_batch
         FROM pages`,
      ),
      // API tokens are excluded on purpose: they are re-issued after a restore.
      env.DB.prepare(
        'SELECT id, kind, name, email, role, locale, created_at, disabled_at FROM actors',
      ),
      env.DB.prepare('SELECT * FROM attachments'),
    ]);
    const meta = {
      format: 'clavis-backup',
      version: 2,
      date,
      parts: state.parts,
      spaces: spaceRows,
      actors: actors?.results ?? [],
      attachments: attachments?.results ?? [],
      pages: ((pageMeta?.results ?? []) as unknown as PageMetaRow[]).map((p) => ({
        ...p,
        path: paths.get(p.id),
      })),
    };
    await env.FILES.put(`${dir}meta.json`, JSON.stringify(meta, null, 2));
    state.done = true;
    state.finishedAt = now.toISOString();
    pruned = await pruneOldBackups(env.FILES, now);
  }
  await env.FILES.put(stateKey, JSON.stringify(state));
  return { state, wrote, pruned };
}

async function pruneOldBackups(bucket: R2Bucket, now: Date): Promise<string[]> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
  const listed = await bucket.list({ prefix: BACKUP_PREFIX, limit: 1000 });
  const old = listed.objects
    .map((o) => o.key)
    .filter((k) => k.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 10) < cutoff);
  if (old.length > 0) await bucket.delete(old);
  return old;
}

/**
 * Human-readable archive paths: SPACE/<parent>--<id>/<title>--<id>.md, with deleted pages
 * under SPACE/_trash/. The short id keeps paths unique even when sanitized titles collide.
 */
export function pagePaths(spaces: SpaceRow[], pages: PathRow[]): Map<string, string> {
  const spaceKey = new Map(spaces.map((s) => [s.id, s.key]));
  const byId = new Map(pages.map((p) => [p.id, p]));
  const out = new Map<string, string>();

  const segment = (p: PathRow) => `${sanitize(p.title)}--${p.short_id}`;
  for (const page of pages) {
    const chain: string[] = [];
    const seen = new Set<string>();
    let cur = page.parent_id ? byId.get(page.parent_id) : undefined;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(segment(cur));
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    const root = spaceKey.get(page.space_id) ?? '_unknown';
    const trash = page.deleted_at ? ['_trash'] : [];
    out.set(page.id, [root, ...trash, ...chain, `${segment(page)}.md`].join('/'));
  }
  return out;
}

function sanitize(title: string): string {
  const s = title
    .normalize('NFC')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are invalid in file names
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 60)
    .trim();
  return s || 'untitled';
}
