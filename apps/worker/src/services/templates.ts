import { hasErrors, lint, parseDocument, sectionsFor } from '@clavis/shared/lint';
import { DOC_TYPES, type DocType, type LintConfig, type Template } from '@clavis/shared/schema';
import { fillTemplate, type Locale, renderTemplate, TEMPLATES } from '@clavis/shared/templates';
import { ulid } from 'ulid';
import type { Actor } from './actors';
import { notFound, ServiceError } from './errors';
import { parseLintConfig } from './quality';

/**
 * Templates (D-49): the seven built-in ones rendered from code with the space's required
 * sections, plus custom ones stored per space or for every space (space_id NULL).
 */

interface TemplateRow {
  id: string;
  space_key: string | null;
  name: string;
  description: string;
  doc_type: string;
  content: string;
  updated_at: number;
}

const builtIn = (type: string): type is DocType => (DOC_TYPES as readonly string[]).includes(type);

export async function listTemplates(
  DB: D1Database,
  actor: Actor,
  opts: { space?: string; locale: Locale },
): Promise<Template[]> {
  const key = opts.space?.toUpperCase() ?? null;
  const [spaceRes, rowsRes] = await DB.batch([
    DB.prepare('SELECT lint_config FROM spaces WHERE key = ?').bind(key ?? ''),
    DB.prepare(
      `SELECT t.id, s.key AS space_key, t.name, t.description, t.doc_type, t.content, t.updated_at
       FROM templates t LEFT JOIN spaces s ON s.id = t.space_id
       WHERE t.space_id IS NULL OR s.key = ?
       ORDER BY t.space_id IS NULL, t.name`,
    ).bind(key ?? ''),
  ]);
  const space = spaceRes?.results[0] as { lint_config: string | null } | undefined;
  if (key && !space) throw notFound('Space');
  const config = parseLintConfig(space?.lint_config);
  const { locale } = opts;
  const names = (type: string) =>
    builtIn(type) ? sectionsFor(type, config).map((s) => s[locale]) : [];

  const custom = ((rowsRes?.results ?? []) as unknown as TemplateRow[]).map(
    (r): Template => ({
      id: r.id,
      scope: r.space_key ? 'space' : 'global',
      spaceKey: r.space_key,
      type: r.doc_type,
      name: r.name,
      description: r.description,
      requiredSections: names(r.doc_type),
      content: r.content,
      updatedAt: r.updated_at,
    }),
  );
  const builtins = TEMPLATES.map(
    (t): Template => ({
      id: t.type,
      scope: 'builtin',
      spaceKey: null,
      type: t.type,
      name: t.name[locale],
      description: t.description[locale],
      requiredSections: names(t.type),
      content: renderTemplate(t.type, {
        owner: actor.email ?? actor.name,
        locale,
        sections: sectionsFor(t.type, config),
      }),
      updatedAt: null,
    }),
  );
  // Custom templates first: a team that wrote its own wants to see them.
  return [...custom, ...builtins];
}

/**
 * The content of a new page made from a template: a document type (built-in, with the
 * space's required sections) or a custom template id usable in this space. One D1 call.
 */
export async function templateContent(
  DB: D1Database,
  spaceKey: string,
  template: string,
  vars: { title: string; owner: string },
): Promise<string> {
  const [spaceRes, tplRes] = await DB.batch([
    DB.prepare('SELECT lint_config FROM spaces WHERE key = ?').bind(spaceKey),
    DB.prepare(
      `SELECT content FROM templates WHERE id = ?
       AND (space_id IS NULL OR space_id = (SELECT id FROM spaces WHERE key = ?))`,
    ).bind(template, spaceKey),
  ]);
  const space = spaceRes?.results[0] as { lint_config: string | null } | undefined;
  if (!space) throw notFound('Space');
  if (builtIn(template)) {
    return renderTemplate(template, {
      owner: vars.owner,
      sections: sectionsFor(template, parseLintConfig(space.lint_config)),
    });
  }
  const row = tplRes?.results[0] as { content: string } | undefined;
  if (!row) {
    throw new ServiceError(400, 'invalid-template', `Unknown template "${template}"`, {
      detail: 'Use a document type or a template id from GET /templates?space=KEY.',
    });
  }
  return fillTemplate(row.content, vars);
}

/**
 * Checks a template the way a page made from it will be checked: placeholders filled with
 * sample values, the space's rules, errors rejected. Returns its document type.
 */
function checkTemplate(content: string, config: LintConfig | undefined): DocType {
  const sample = fillTemplate(content, { title: 'Title', owner: 'owner@example.com' });
  const doc = parseDocument(sample);
  // No link or attachment checks: a template has no page yet.
  const violations = lint(doc, { config });
  if (hasErrors(violations) || !doc.frontmatter) {
    throw new ServiceError(422, 'lint-failed', 'The template has lint errors', {
      violations: violations.filter((v) => v.severity === 'error'),
    });
  }
  return doc.frontmatter.type;
}

const adminOnly = () =>
  new ServiceError(403, 'forbidden', 'Only admins manage templates for every space');

export async function createTemplate(
  DB: D1Database,
  actor: Actor,
  input: { space: string | null; name: string; description: string; content: string },
  now = Date.now(),
): Promise<string> {
  if (input.space === null && actor.role !== 'admin') throw adminOnly();
  let spaceId: string | null = null;
  let config: LintConfig | undefined;
  if (input.space !== null) {
    const space = await DB.prepare('SELECT id, lint_config FROM spaces WHERE key = ?')
      .bind(input.space.toUpperCase())
      .first<{ id: string; lint_config: string | null }>();
    if (!space) throw notFound('Space');
    spaceId = space.id;
    config = parseLintConfig(space.lint_config);
  }
  const docType = checkTemplate(input.content, config);
  const id = ulid(now);
  await DB.prepare(
    `INSERT INTO templates (id, space_id, name, description, doc_type, content,
       created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      spaceId,
      input.name,
      input.description,
      docType,
      input.content,
      actor.id,
      actor.id,
      now,
      now,
    )
    .run();
  return id;
}

async function stored(DB: D1Database, actor: Actor, id: string) {
  const row = await DB.prepare(
    `SELECT t.space_id, s.lint_config FROM templates t LEFT JOIN spaces s ON s.id = t.space_id
     WHERE t.id = ?`,
  )
    .bind(id)
    .first<{ space_id: string | null; lint_config: string | null }>();
  if (!row) throw notFound('Template');
  if (row.space_id === null && actor.role !== 'admin') throw adminOnly();
  return row;
}

export async function updateTemplate(
  DB: D1Database,
  actor: Actor,
  id: string,
  input: { name: string; description: string; content: string },
  now = Date.now(),
): Promise<void> {
  const row = await stored(DB, actor, id);
  const docType = checkTemplate(input.content, parseLintConfig(row.lint_config));
  await DB.prepare(
    `UPDATE templates SET name = ?, description = ?, doc_type = ?, content = ?,
       updated_by = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(input.name, input.description, docType, input.content, actor.id, now, id)
    .run();
}

export async function deleteTemplate(DB: D1Database, actor: Actor, id: string): Promise<void> {
  await stored(DB, actor, id);
  await DB.prepare('DELETE FROM templates WHERE id = ?').bind(id).run();
}
