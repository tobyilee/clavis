import { type SearchHit, SNIPPET_CLOSE, SNIPPET_OPEN } from '@clavis/shared/schema';

export interface SearchQuery {
  q: string;
  space?: string;
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

interface HitRow {
  id: string;
  short_id: string;
  space_key: string;
  title: string;
  slug: string;
  doc_type: string;
  status: string;
  updated_at: number;
  snippet: string;
}

/** Search terms: whitespace-separated, quotes stripped, at most 8. */
export function searchTerms(q: string): string[] {
  return q
    .replace(/"/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Full-text search (D-11). Every term with 3+ characters goes through the trigram FTS
 * index; if any term is shorter, trigram cannot match it, so the query falls back to LIKE
 * (fine at a few hundred pages). Terms are ANDed. Returns one extra row to detect more.
 */
export async function searchPages(
  DB: D1Database,
  query: SearchQuery,
): Promise<{ hits: SearchHit[]; more: boolean }> {
  const terms = searchTerms(query.q);
  if (terms.length === 0) return { hits: [], more: false };
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
  const offset = Math.max(query.offset ?? 0, 0);

  const filters: string[] = ['p.deleted_at IS NULL', 's.archived_at IS NULL'];
  const filterBinds: unknown[] = [];
  const filter = (sql: string, value: unknown) => {
    filters.push(sql);
    filterBinds.push(value);
  };
  if (query.space) filter('s.key = ?', query.space.toUpperCase());
  if (query.type) filter('p.doc_type = ?', query.type);
  if (query.status) filter('p.status = ?', query.status);

  const useFts = terms.every((t) => [...t].length >= 3);
  let stmt: D1PreparedStatement;
  if (useFts) {
    // Each term is a quoted FTS phrase, so operators typed by the user are plain text.
    const match = terms.map((t) => `"${t}"`).join(' AND ');
    stmt = DB.prepare(
      `SELECT p.id, p.short_id, s.key AS space_key, p.title, p.slug, p.doc_type, p.status,
              p.updated_at,
              snippet(pages_fts, 1, char(57344), char(57345), '…', 16) AS snippet
       FROM pages_fts
       JOIN pages p ON p.rowid = pages_fts.rowid
       JOIN spaces s ON s.id = p.space_id
       WHERE pages_fts MATCH ? AND ${filters.join(' AND ')}
       ORDER BY bm25(pages_fts, 10.0, 1.0)
       LIMIT ? OFFSET ?`,
    ).bind(match, ...filterBinds, limit + 1, offset);
  } else {
    const likes = terms.map(() => "(p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')");
    const likeBinds = terms.flatMap((t) => {
      const pattern = `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return [pattern, pattern];
    });
    const first = terms[0] ?? '';
    stmt = DB.prepare(
      `SELECT p.id, p.short_id, s.key AS space_key, p.title, p.slug, p.doc_type, p.status,
              p.updated_at,
              substr(p.content, max(1, instr(lower(p.content), lower(?)) - 40), 160) AS snippet
       FROM pages p JOIN spaces s ON s.id = p.space_id
       WHERE ${[...likes, ...filters].join(' AND ')}
       ORDER BY (instr(lower(p.title), lower(?)) > 0) DESC, p.updated_at DESC
       LIMIT ? OFFSET ?`,
    ).bind(first, ...likeBinds, ...filterBinds, first, limit + 1, offset);
  }
  const { results } = await stmt.all<HitRow>();
  const more = results.length > limit;
  return {
    hits: results.slice(0, limit).map((r) => ({
      id: r.id,
      shortId: r.short_id,
      spaceKey: r.space_key,
      title: r.title,
      slug: r.slug,
      docType: r.doc_type,
      status: r.status,
      updatedAt: r.updated_at,
      snippet: useFts ? r.snippet : markTerms(r.snippet, terms),
    })),
    more,
  };
}

/** Wraps term occurrences in the snippet markers, as FTS snippet() does. */
function markTerms(text: string, terms: string[]): string {
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.replace(
    new RegExp(escaped.join('|'), 'gi'),
    (m) => `${SNIPPET_OPEN}${m}${SNIPPET_CLOSE}`,
  );
}
