import {
  docWikiLinks,
  hasErrors,
  type LintDocument,
  lint,
  parseDocument,
} from '@clavis/shared/lint';
import type { LintConfig, Violation } from '@clavis/shared/schema';
import { ServiceError } from './errors';
import { parseLintConfig } from './quality';

export interface LinkTarget {
  /** null = the linking page's own space (D-23), filled in by SQL when not yet known. */
  spaceKey: string | null;
  title: string;
}

const linkKey = (spaceKey: string, title: string) => `${spaceKey}\u0000${title}`;

/** Unique wiki link targets. Pass the page's space key when known; null leaves it to SQL. */
export function linkTargets(
  content: string | LintDocument,
  currentSpaceKey: string | null,
): LinkTarget[] {
  const doc = typeof content === 'string' ? parseDocument(content) : content;
  const seen = new Map<string, LinkTarget>();
  // Memoized on the document: the wiki-link lint rule reuses the same extraction.
  for (const l of docWikiLinks(doc)) {
    const spaceKey = l.spaceKey ?? currentSpaceKey;
    seen.set(linkKey(spaceKey ?? '', l.title), { spaceKey, title: l.title });
  }
  return [...seen.values()];
}

/**
 * Finds which link targets exist. The targets travel as one JSON parameter because D1
 * allows at most 100 bound parameters per statement. `currentSpace` is a scalar subquery
 * giving the linking page's space key, for targets whose key is still null.
 */
export function resolveLinksStatement(
  DB: D1Database,
  targets: LinkTarget[],
  currentSpace: { sql: string; binds: unknown[] } = { sql: 'NULL', binds: [] },
) {
  return DB.prepare(
    `SELECT s.key AS space_key, p.title, p.id
     FROM json_each(?) j
     JOIN spaces s ON s.key = COALESCE(json_extract(j.value, '$[0]'), (${currentSpace.sql}))
     JOIN pages p ON p.space_id = s.id AND p.title = json_extract(j.value, '$[1]')
     WHERE p.deleted_at IS NULL`,
  ).bind(JSON.stringify(targets.map((t) => [t.spaceKey, t.title])), ...currentSpace.binds);
}

export type ResolvedLinks = Map<string, string>;

export function resolvedLinks(result: D1Result | undefined): ResolvedLinks {
  const rows = (result?.results ?? []) as { space_key: string; title: string; id: string }[];
  return new Map(rows.map((r) => [linkKey(r.space_key, r.title), r.id]));
}

export const lookupLink = (resolved: ResolvedLinks, t: LinkTarget, currentSpaceKey: string) =>
  resolved.get(linkKey(t.spaceKey ?? currentSpaceKey, t.title)) ?? null;

/**
 * Runs every Clavis rule, as the server does at save time (D-27). Blocking errors throw 422
 * with all findings; otherwise the findings (warnings and info) are returned.
 */
export function lintForSave(
  content: LintDocument,
  spaceKey: string,
  resolved: ResolvedLinks,
  attachments: ReadonlySet<string>,
  config?: LintConfig,
): Violation[] {
  const violations = lint(content, {
    config,
    resolveLink: (key, title) => resolved.has(linkKey(key ?? spaceKey, title)),
    attachmentExists: (name) => attachments.has(name),
  });
  if (hasErrors(violations)) {
    throw new ServiceError(422, 'lint-failed', 'The page has lint errors', { violations });
  }
  return violations;
}

/**
 * Lints without saving (POST /lint, MCP lint_markdown): every server rule, one D1 call.
 * Unprefixed wiki links resolve in `space` (or the page's space); with neither they are
 * not checked. Attachments are checked only when a page is given.
 */
export async function lintContent(
  DB: D1Database,
  content: string,
  opts: { space?: string; page?: string } = {},
): Promise<Violation[]> {
  const space = opts.space?.toUpperCase() ?? null;
  const pageWhere = '(p.id = ? OR p.short_id = ?) AND p.deleted_at IS NULL';
  const pageBinds = [opts.page ?? '', opts.page ?? ''];
  const doc = parseDocument(content);
  const targets = linkTargets(doc, space);
  const [linksRes, attRes, pageRes, configRes] = await DB.batch([
    resolveLinksStatement(
      DB,
      targets,
      opts.page
        ? {
            sql: `SELECT s.key FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${pageWhere}`,
            binds: pageBinds,
          }
        : undefined,
    ),
    DB.prepare(
      `SELECT a.filename FROM attachments a JOIN pages p ON p.id = a.page_id WHERE ${pageWhere}`,
    ).bind(...pageBinds),
    DB.prepare(
      `SELECT s.key FROM pages p JOIN spaces s ON s.id = p.space_id WHERE ${pageWhere}`,
    ).bind(...pageBinds),
    // The space's rule config: the given space, else the page's.
    DB.prepare(
      `SELECT lint_config FROM spaces WHERE key = ? OR id = (
         SELECT p.space_id FROM pages p WHERE ${pageWhere}) ORDER BY key = ? DESC LIMIT 1`,
    ).bind(space ?? '', ...pageBinds, space ?? ''),
  ]);
  const resolved = resolvedLinks(linksRes);
  const currentKey = space ?? (pageRes?.results[0] as { key: string } | undefined)?.key ?? null;
  const attachments = new Set(
    ((attRes?.results ?? []) as { filename: string }[]).map((a) => a.filename),
  );
  const config = parseLintConfig(
    (configRes?.results[0] as { lint_config: string | null } | undefined)?.lint_config,
  );
  return lint(doc, {
    config,
    resolveLink: (key, title) =>
      key === null && currentKey === null
        ? true
        : resolved.has(linkKey(key ?? currentKey ?? '', title)),
    attachmentExists: opts.page ? (name) => attachments.has(name) : undefined,
  });
}
