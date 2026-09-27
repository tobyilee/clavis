import { lint, parseDocument } from '@clavis/shared/lint';
import type {
  LintConfig,
  RecheckResult,
  RuleSummary,
  SpaceHealth,
  Violation,
} from '@clavis/shared/schema';
import { notFound } from './errors';

/**
 * Page lint summaries and the Space dashboard (D-46). Saves write a summary as part of their
 * write batch; rechecks fill in pages that have none or were checked under an older config.
 */

/** Page content a recheck lints per request: lint is ~0.05ms/KB, so this stays near 5ms. */
export const RECHECK_BYTES = 100_000;

/** Wiki link findings change when other pages do, so the dashboard reads page_links. */
const LINK_RULE = 'clavis/wiki-link-exists';

/** Stored config is validated on write (PUT lint-config), so reads only parse it. */
export function parseLintConfig(json: string | null | undefined): LintConfig | undefined {
  return json ? (JSON.parse(json) as LintConfig) : undefined;
}

export interface LintSummary {
  errors: number;
  warnings: number;
  infos: number;
  /** {"<ruleId>": {"s": severity, "n": count, "l": first line}} */
  rules: string;
}

type StoredRules = Record<string, { s: RuleSummary['severity']; n: number; l: number }>;

export function summarize(violations: readonly Violation[]): LintSummary {
  const rules: StoredRules = {};
  const counts = { error: 0, warning: 0, info: 0 };
  for (const v of violations) {
    if (v.ruleId === LINK_RULE) continue;
    counts[v.severity]++;
    const r = rules[v.ruleId];
    if (r) r.n++;
    else rules[v.ruleId] = { s: v.severity, n: 1, l: v.line };
  }
  return {
    errors: counts.error,
    warnings: counts.warning,
    infos: counts.info,
    rules: JSON.stringify(rules),
  };
}

/** Upsert for one saved page; part of the save's write batch. */
export function summaryStatement(
  DB: D1Database,
  pageId: string,
  revision: number,
  configVersion: number,
  s: LintSummary,
  now: number,
) {
  return DB.prepare(
    `INSERT INTO page_lint (page_id, revision, config_version, errors, warnings, infos, rules, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (page_id) DO UPDATE SET revision = excluded.revision,
       config_version = excluded.config_version, errors = excluded.errors,
       warnings = excluded.warnings, infos = excluded.infos, rules = excluded.rules,
       checked_at = excluded.checked_at`,
  ).bind(pageId, revision, configVersion, s.errors, s.warnings, s.infos, s.rules, now);
}

/** Live pages of the space (bound by key) that need a (re)check. */
const STALE = `
  FROM pages p JOIN spaces s ON s.id = p.space_id
  LEFT JOIN page_lint l ON l.page_id = p.id
  WHERE s.key = ? AND p.deleted_at IS NULL
    AND (l.page_id IS NULL OR l.config_version != s.lint_config_version)`;

/** The next chunk: pages in id order up to RECHECK_BYTES of content, at least one. */
const CHUNK = `
  SELECT id, revision, content FROM (
    SELECT p.id, p.revision, p.content,
           ROW_NUMBER() OVER (ORDER BY p.id) AS n,
           SUM(length(CAST(p.content AS BLOB))) OVER (ORDER BY p.id) AS running
    ${STALE})
  WHERE n = 1 OR running <= ?`;

/**
 * Lints the next chunk of stale pages and stores their summaries. No cursor is needed:
 * checked pages stop matching STALE, so callers repeat until `remaining` is 0. Two D1 calls.
 */
export async function recheckSpace(
  DB: D1Database,
  spaceKey: string,
  now = Date.now(),
): Promise<RecheckResult> {
  const key = spaceKey.toUpperCase();
  const [spaceRes, chunkRes, attRes, staleRes] = await DB.batch([
    DB.prepare('SELECT lint_config, lint_config_version FROM spaces WHERE key = ?').bind(key),
    DB.prepare(CHUNK).bind(key, RECHECK_BYTES),
    DB.prepare(
      `SELECT page_id, filename FROM attachments
       WHERE page_id IN (SELECT id FROM (${CHUNK}))`,
    ).bind(key, RECHECK_BYTES),
    DB.prepare(`SELECT COUNT(*) AS n ${STALE}`).bind(key),
  ]);
  const space = spaceRes?.results[0] as
    | { lint_config: string | null; lint_config_version: number }
    | undefined;
  if (!space) throw notFound('Space');
  const pages = (chunkRes?.results ?? []) as { id: string; revision: number; content: string }[];
  const stale = (staleRes?.results[0] as { n: number } | undefined)?.n ?? 0;
  if (pages.length === 0) return { checked: 0, remaining: stale };

  const files = new Map<string, Set<string>>();
  for (const a of (attRes?.results ?? []) as { page_id: string; filename: string }[]) {
    const set = files.get(a.page_id) ?? new Set();
    set.add(a.filename);
    files.set(a.page_id, set);
  }
  const config = parseLintConfig(space.lint_config);
  const rows = pages.map((p) => {
    const names = files.get(p.id);
    // No resolveLink: the link rule is skipped, as summaries leave it out anyway.
    const s = summarize(
      lint(parseDocument(p.content), {
        config,
        attachmentExists: (name) => names?.has(name) ?? false,
      }),
    );
    return [p.id, p.revision, s.errors, s.warnings, s.infos, s.rules];
  });
  // One statement for the whole chunk; a page saved since we read it keeps its own summary.
  const written = await DB.prepare(
    `INSERT INTO page_lint (page_id, revision, config_version, errors, warnings, infos, rules, checked_at)
     SELECT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), ?,
            json_extract(j.value, '$[2]'), json_extract(j.value, '$[3]'),
            json_extract(j.value, '$[4]'), json_extract(j.value, '$[5]'), ?
     FROM json_each(?) j
     JOIN pages p ON p.id = json_extract(j.value, '$[0]') AND p.revision = json_extract(j.value, '$[1]')
     WHERE true
     ON CONFLICT (page_id) DO UPDATE SET revision = excluded.revision,
       config_version = excluded.config_version, errors = excluded.errors,
       warnings = excluded.warnings, infos = excluded.infos, rules = excluded.rules,
       checked_at = excluded.checked_at`,
  )
    .bind(space.lint_config_version, now, JSON.stringify(rows))
    .run();
  const checked = written.meta.changes ?? pages.length;
  return { checked, remaining: Math.max(0, stale - checked) };
}

interface IssueRow {
  id: string;
  short_id: string;
  title: string;
  slug: string;
  errors: number;
  warnings: number;
  infos: number;
  rules: string;
  stale: number;
}

/**
 * The Space dashboard in one D1 call. Rule totals are aggregated by D1 (json_each over the
 * stored summaries), so the Worker only shapes rows.
 */
export async function spaceHealth(DB: D1Database, spaceKey: string): Promise<SpaceHealth> {
  const key = spaceKey.toUpperCase();
  const live = `FROM page_lint l JOIN pages p ON p.id = l.page_id JOIN spaces s ON s.id = p.space_id
    WHERE s.key = ? AND p.deleted_at IS NULL`;
  const [spaceRes, pagesRes, rulesRes, brokenRes] = await DB.batch([
    DB.prepare(
      `SELECT s.lint_config_version AS version,
         (SELECT COUNT(*) FROM pages WHERE space_id = s.id AND deleted_at IS NULL) AS total,
         (SELECT COUNT(*) ${STALE}) AS stale,
         (SELECT SUM(l.errors) ${live}) AS errors,
         (SELECT SUM(l.warnings) ${live}) AS warnings,
         (SELECT SUM(l.infos) ${live}) AS infos
       FROM spaces s WHERE s.key = ?`,
    ).bind(key, key, key, key, key),
    DB.prepare(
      `SELECT p.id, p.short_id, p.title, p.slug, l.errors, l.warnings, l.infos, l.rules,
              l.config_version != s.lint_config_version AS stale
       ${live} AND l.errors + l.warnings + l.infos > 0
       ORDER BY l.errors DESC, l.warnings DESC, l.infos DESC, p.title LIMIT 200`,
    ).bind(key),
    DB.prepare(
      `SELECT j.key AS rule_id, json_extract(j.value, '$.s') AS severity,
              COUNT(*) AS pages, SUM(json_extract(j.value, '$.n')) AS count
       ${live.replace('WHERE', ', json_each(l.rules) j WHERE')}
       GROUP BY j.key ORDER BY pages DESC, rule_id`,
    ).bind(key),
    DB.prepare(
      `SELECT p.id, p.short_id, p.title, p.slug, k.target_space_key, k.target_title
       FROM page_links k JOIN pages p ON p.id = k.from_page_id JOIN spaces s ON s.id = p.space_id
       WHERE s.key = ? AND p.deleted_at IS NULL AND k.to_page_id IS NULL
       ORDER BY p.title, k.target_title LIMIT 500`,
    ).bind(key),
  ]);
  const head = spaceRes?.results[0] as
    | {
        version: number;
        total: number;
        stale: number;
        errors: number | null;
        warnings: number | null;
        infos: number | null;
      }
    | undefined;
  if (!head) throw notFound('Space');

  const broken = new Map<string, SpaceHealth['brokenLinks'][number]>();
  for (const r of (brokenRes?.results ?? []) as {
    id: string;
    short_id: string;
    title: string;
    slug: string;
    target_space_key: string;
    target_title: string;
  }[]) {
    let entry = broken.get(r.id);
    if (!entry) {
      entry = { id: r.id, shortId: r.short_id, title: r.title, slug: r.slug, targets: [] };
      broken.set(r.id, entry);
    }
    entry.targets.push({ spaceKey: r.target_space_key, title: r.target_title });
  }

  return {
    space: key,
    configVersion: head.version,
    totalPages: head.total,
    stalePages: head.stale,
    totals: { errors: head.errors ?? 0, warnings: head.warnings ?? 0, infos: head.infos ?? 0 },
    rules: (
      (rulesRes?.results ?? []) as {
        rule_id: string;
        severity: RuleSummary['severity'];
        pages: number;
        count: number;
      }[]
    ).map((r) => ({ ruleId: r.rule_id, severity: r.severity, pages: r.pages, count: r.count })),
    pages: ((pagesRes?.results ?? []) as unknown as IssueRow[]).map((r) => ({
      id: r.id,
      shortId: r.short_id,
      title: r.title,
      slug: r.slug,
      errors: r.errors,
      warnings: r.warnings,
      infos: r.infos,
      stale: r.stale === 1,
      rules: Object.entries(JSON.parse(r.rules) as StoredRules).map(([ruleId, v]) => ({
        ruleId,
        severity: v.s,
        count: v.n,
        line: v.l,
      })),
    })),
    brokenLinks: [...broken.values()],
  };
}
