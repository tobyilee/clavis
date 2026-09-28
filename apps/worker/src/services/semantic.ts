import { chunkPage, fnv1a } from '@clavis/shared/markdown';
import type { SearchHit } from '@clavis/shared/schema';
import type { EventHandler, IndexJob, RunBudget } from '../events';
import { type SearchQuery, searchPages } from './search';

/**
 * Semantic search (Phase 3 Step 4). Pages are cut into H2 chunks (D-63), embedded with
 * bge-m3 (D-61) and kept in Vectorize, one vector per chunk; D1 `page_chunks` has a row per
 * vector with what a result shows. The queue consumer indexes after saves (D-62): only
 * chunks whose text changed are embedded, and removed ones are deleted.
 *
 * Every step can fail on the free plan (the daily Workers AI allowance, a Vectorize limit),
 * so indexing never throws into the consumer: it queues its own retry, and a page left
 * behind stays "awaiting indexing" for the next backfill. Search falls back to full text.
 */

export const EMBED_MODEL = '@cf/baai/bge-m3';
/** Free plan: 5M stored dimensions, i.e. this many 1024-dimension vectors. */
export const VECTOR_LIMIT = 4882;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS = [60, 600, 3600];
/** Chunks fetched per query; several may belong to one page. */
const TOP_K = 50;
/** Below this cosine similarity a chunk is not about the query (to tune in E5). */
export const MIN_SCORE = 0.4;
/** Reciprocal rank fusion constant for hybrid search. */
const RRF_K = 60;

export type SearchMode = 'text' | 'semantic' | 'hybrid';

/** Neither binding exists in local dev and tests unless provided. */
const available = (env: Env) => Boolean(env.AI && env.VECTORIZE);

async function embed(env: Env, texts: string[]): Promise<number[][]> {
  const out = (await env.AI.run(EMBED_MODEL, { text: texts })) as { data?: number[][] };
  if (out.data?.length !== texts.length) throw new Error('unexpected embedding response');
  return out.data;
}

const log = (event: string, fields: Record<string, unknown>) =>
  console.error(JSON.stringify({ event, ...fields }));

// ── Indexing ───────────────────────────────────────────────────────────────

interface PageRow {
  title: string;
  content: string;
  doc_type: string;
  revision: number;
  deleted_at: number | null;
  space_key: string;
  indexed: number | null;
}

interface ChunkRow {
  id: string;
  ord: number;
  sectionId: string | null;
  heading: string | null;
  excerpt: string;
  chars: number;
  text: string;
}

const queueJobs = async (env: Env, pageIds: string[], attempt = 1, delaySeconds?: number) => {
  for (let i = 0; i < pageIds.length; i += 100) {
    await env.EVENTS.sendBatch(
      pageIds.slice(i, i + 100).map((pageId) => ({
        body: { type: 'index.page', pageId, attempt } satisfies IndexJob,
        delaySeconds,
      })),
    );
  }
};

/**
 * Brings one page's vectors up to date, embedding at most `budget.chunks` chunks; the rest
 * go on as another queue message. Its rows are written only if the page is still at the
 * revision that was read, so a run that raced a newer save changes nothing.
 */
export async function indexPage(env: Env, pageId: string, budget: RunBudget): Promise<void> {
  const DB = env.DB;
  const [pageRes, storedRes] = await DB.batch([
    DB.prepare(
      `SELECT p.title, p.content, p.doc_type, p.revision, p.deleted_at, s.key AS space_key,
              i.revision AS indexed
       FROM pages p JOIN spaces s ON s.id = p.space_id
       LEFT JOIN page_index i ON i.page_id = p.id
       WHERE p.id = ?`,
    ).bind(pageId),
    DB.prepare('SELECT id FROM page_chunks WHERE page_id = ?').bind(pageId),
  ]);
  const page = pageRes?.results[0] as PageRow | undefined;
  if (!page || page.deleted_at !== null) return removePages(env, [pageId]);
  if (page.indexed === page.revision) return;

  const chunks = new Map<string, ChunkRow>();
  chunkPage(page.title, page.content).forEach((c, ord) => {
    // docType is in the hash so a type change re-sends the vector's metadata.
    const id = `${pageId}:${fnv1a(`${page.doc_type}\n${c.text}`)}`;
    if (!chunks.has(id)) chunks.set(id, { id, ord, ...c, chars: c.text.length });
  });
  const stored = new Set(((storedRes?.results ?? []) as { id: string }[]).map((r) => r.id));
  const missing = [...chunks.values()].filter((c) => !stored.has(c.id));
  const gone = [...stored].filter((id) => !chunks.has(id));
  const now = missing.slice(0, Math.max(budget.chunks, 0));
  budget.chunks -= now.length;

  if (now.length > 0) {
    const values = await embed(
      env,
      now.map((c) => c.text),
    );
    await env.VECTORIZE.upsert(
      now.map((c, i) => ({
        id: c.id,
        values: values[i] ?? [],
        metadata: { space: page.space_key, docType: page.doc_type },
      })),
    );
  }

  const embedded = new Set(now.map((c) => c.id));
  const rows = [...chunks.values()]
    .filter((c) => stored.has(c.id) || embedded.has(c.id))
    .map(({ text: _text, ...row }) => row);
  const done = now.length === missing.length;
  const unchanged = 'EXISTS (SELECT 1 FROM pages WHERE id = ?1 AND revision = ?2)';
  const results = await DB.batch([
    DB.prepare(`DELETE FROM page_chunks WHERE page_id = ?1 AND ${unchanged}`).bind(
      pageId,
      page.revision,
    ),
    DB.prepare(
      `INSERT INTO page_chunks (id, page_id, ord, section_id, heading, excerpt, chars)
       SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.ord'),
              json_extract(value, '$.sectionId'), json_extract(value, '$.heading'),
              json_extract(value, '$.excerpt'), json_extract(value, '$.chars')
       FROM json_each(?3) WHERE ${unchanged}`,
    ).bind(pageId, page.revision, JSON.stringify(rows)),
    ...(done
      ? [
          DB.prepare(
            `INSERT INTO page_index (page_id, revision, indexed_at) SELECT ?1, ?2, ?3 WHERE ${unchanged}
             ON CONFLICT (page_id) DO UPDATE SET revision = excluded.revision,
               indexed_at = excluded.indexed_at`,
          ).bind(pageId, page.revision, Date.now()),
        ]
      : []),
    DB.prepare(`SELECT ${unchanged} AS applied`).bind(pageId, page.revision),
  ]);
  const applied = (results.at(-1)?.results[0] as { applied: number } | undefined)?.applied === 1;
  if (!applied) return; // a newer save came in; its own event indexes the page
  if (gone.length > 0) await env.VECTORIZE.deleteByIds(gone);
  if (!done) await queueJobs(env, [pageId]);
}

/** Drops the vectors and rows of pages that are (still) in the trash or gone. */
export async function removePages(env: Env, pageIds: string[]): Promise<void> {
  const DB = env.DB;
  const ids = JSON.stringify(pageIds);
  const trashed = `SELECT value FROM json_each(?1) WHERE NOT EXISTS
      (SELECT 1 FROM pages WHERE id = value AND deleted_at IS NULL)`;
  const { results } = await DB.prepare(`SELECT id FROM page_chunks WHERE page_id IN (${trashed})`)
    .bind(ids)
    .all<{ id: string }>();
  const vectorIds = results.map((r) => r.id);
  for (let i = 0; i < vectorIds.length; i += 1000) {
    await env.VECTORIZE.deleteByIds(vectorIds.slice(i, i + 1000));
  }
  await DB.batch([
    DB.prepare(`DELETE FROM page_chunks WHERE page_id IN (${trashed})`).bind(ids),
    DB.prepare(`DELETE FROM page_index WHERE page_id IN (${trashed})`).bind(ids),
  ]);
}

/** Indexes pages in turn while the run's budget lasts; the others are queued. */
async function indexPages(env: Env, pageIds: string[], budget: RunBudget, attempt: number) {
  for (const [i, pageId] of pageIds.entries()) {
    if (budget.chunks <= 0) return queueJobs(env, pageIds.slice(i));
    try {
      await indexPage(env, pageId, budget);
    } catch (e) {
      log('index-failed', { pageId, attempt, error: String(e) });
      // Left behind after the last attempt: the page stays stale for the next backfill.
      if (attempt < MAX_ATTEMPTS) {
        await queueJobs(env, [pageId], attempt + 1, RETRY_DELAYS[attempt - 1]);
      }
    }
  }
}

/** The queue handler (events/handlers.ts). */
export const indexOnEvent: EventHandler = async (env, event, budget) => {
  if (!available(env)) return;
  try {
    switch (event.type) {
      case 'page.saved':
        return await indexPages(env, [event.pageId], budget, 1);
      case 'page.restored':
        return await indexPages(env, event.pageIds, budget, 1);
      case 'index.page':
        return await indexPages(env, [event.pageId], budget, event.attempt);
      case 'page.trashed':
        return await removePages(env, event.pageIds).catch(async (e: unknown) => {
          log('index-remove-failed', { error: String(e) });
          // An index job for a trashed page removes it.
          await queueJobs(env, event.pageIds, 2, RETRY_DELAYS[0]);
        });
    }
  } catch (e) {
    // Throwing would retry the whole message, and repeat notifications with it.
    log('index-handler-failed', { type: event.type, error: String(e) });
  }
};

// ── Backfill and status (E3) ───────────────────────────────────────────────

const LIVE = `FROM pages p JOIN spaces s ON s.id = p.space_id
  LEFT JOIN page_index i ON i.page_id = p.id
  WHERE p.deleted_at IS NULL AND s.archived_at IS NULL`;

export interface IndexStatus {
  available: boolean;
  pages: number;
  indexed: number;
  vectors: number;
  vectorLimit: number;
}

export async function indexStatus(env: Env): Promise<IndexStatus> {
  const [pagesRes, vectorsRes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT count(*) AS pages, coalesce(sum(i.revision = p.revision), 0) AS indexed ${LIVE}`,
    ),
    env.DB.prepare('SELECT count(*) AS vectors FROM page_chunks'),
  ]);
  const counts = pagesRes?.results[0] as { pages: number; indexed: number } | undefined;
  const vectors = (vectorsRes?.results[0] as { vectors: number } | undefined)?.vectors ?? 0;
  return {
    available: available(env),
    pages: counts?.pages ?? 0,
    indexed: counts?.indexed ?? 0,
    vectors,
    vectorLimit: VECTOR_LIMIT,
  };
}

/** Queues an index job for every page not indexed at its current revision. */
export async function queueStalePages(env: Env, limit = 2000): Promise<number> {
  if (!available(env)) return 0;
  const { results } = await env.DB.prepare(
    `SELECT p.id ${LIVE} AND (i.revision IS NULL OR i.revision != p.revision)
     ORDER BY p.updated_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<{ id: string }>();
  await queueJobs(
    env,
    results.map((r) => r.id),
  );
  return results.length;
}

// ── Search (E4) ────────────────────────────────────────────────────────────

interface ChunkHitRow {
  chunk_id: string;
  section_id: string | null;
  heading: string | null;
  excerpt: string;
  id: string;
  short_id: string;
  space_key: string;
  title: string;
  slug: string;
  doc_type: string;
  status: string;
  updated_at: number;
}

/**
 * Pages whose chunks are closest to the query, best first, each with its best section. One
 * embedding, one Vectorize query and one D1 read.
 */
export async function semanticSearch(env: Env, query: SearchQuery): Promise<SearchHit[]> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
  const [vector] = await embed(env, [query.q]);
  const filter: VectorizeVectorMetadataFilter = {};
  if (query.space) filter.space = query.space.toUpperCase();
  if (query.type) filter.docType = query.type;
  const found = await env.VECTORIZE.query(vector ?? [], {
    topK: TOP_K,
    ...(Object.keys(filter).length > 0 ? { filter } : {}),
    returnValues: false,
    returnMetadata: 'none',
  });
  const scores = new Map(
    found.matches.filter((m) => m.score >= MIN_SCORE).map((m) => [m.id, m.score]),
  );
  if (scores.size === 0) return [];

  const binds: unknown[] = [JSON.stringify([...scores.keys()])];
  let status = '';
  if (query.status) {
    status = 'AND p.status = ?';
    binds.push(query.status);
  }
  const { results } = await env.DB.prepare(
    `SELECT c.id AS chunk_id, c.section_id, c.heading, c.excerpt, p.id, p.short_id,
            s.key AS space_key, p.title, p.slug, p.doc_type, p.status, p.updated_at
     FROM page_chunks c JOIN pages p ON p.id = c.page_id JOIN spaces s ON s.id = p.space_id
     WHERE c.id IN (SELECT value FROM json_each(?)) AND p.deleted_at IS NULL
       AND s.archived_at IS NULL ${status}`,
  )
    .bind(...binds)
    .all<ChunkHitRow>();

  const score = (r: ChunkHitRow) => scores.get(r.chunk_id) ?? 0;
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const r of results.sort((a, b) => score(b) - score(a))) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    hits.push({
      id: r.id,
      shortId: r.short_id,
      spaceKey: r.space_key,
      title: r.title,
      slug: r.slug,
      docType: r.doc_type,
      status: r.status,
      updatedAt: r.updated_at,
      snippet: r.excerpt,
      section: r.section_id && r.heading ? { id: r.section_id, title: r.heading } : null,
      score: Math.round(score(r) * 1000) / 1000,
    });
    if (hits.length === limit) break;
  }
  return hits;
}

/**
 * Full text and meaning together: each list ranks pages, and a page scores the sum of
 * 1 / (RRF_K + rank) over the lists it is in (reciprocal rank fusion, no reranker: none reads
 * Korean). A page found by both keeps the full-text snippet and the semantic section.
 */
export function fuse(text: SearchHit[], meaning: SearchHit[], limit: number): SearchHit[] {
  const merged = new Map<string, { hit: SearchHit; score: number }>();
  for (const list of [text, meaning]) {
    list.forEach((hit, rank) => {
      const add = 1 / (RRF_K + rank + 1);
      const m = merged.get(hit.id);
      if (!m) merged.set(hit.id, { hit, score: add });
      else {
        m.score += add;
        m.hit = { ...m.hit, section: m.hit.section ?? hit.section, score: hit.score };
      }
    });
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((m) => m.hit);
}

/**
 * Search in a mode. Semantic and hybrid return one page of results (no cursor), and fall
 * back to full text when Workers AI or Vectorize fails; `mode` says which ran.
 */
export async function searchInMode(
  env: Env,
  query: SearchQuery,
  mode: SearchMode,
): Promise<{ hits: SearchHit[]; more: boolean; mode: SearchMode }> {
  if (mode !== 'text' && available(env)) {
    try {
      if (mode === 'semantic') {
        return { hits: await semanticSearch(env, query), more: false, mode };
      }
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
      const [text, meaning] = await Promise.all([
        searchPages(env.DB, { ...query, offset: 0 }),
        semanticSearch(env, query),
      ]);
      return { hits: fuse(text.hits, meaning, limit), more: false, mode };
    } catch (e) {
      log('semantic-search-failed', { error: String(e) });
    }
  }
  const { hits, more } = await searchPages(env.DB, query);
  return { hits, more, mode: 'text' };
}
