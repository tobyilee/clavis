import type { LintConfig, Space } from '@clavis/shared/schema';
import { slugify } from '@clavis/shared/schema';
import { renderTemplate } from '@clavis/shared/templates';
import { ulid } from 'ulid';
import type { Actor } from './actors';
import { notFound, ServiceError } from './errors';

interface SpaceRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  home_short_id: string | null;
  tree_version: number;
  created_at: number;
  archived_at: number | null;
  lint_config: string | null;
  lint_config_version: number;
}

const SELECT_SPACE = `
  SELECT s.id, s.key, s.name, s.description, h.short_id AS home_short_id, s.tree_version,
         s.created_at, s.archived_at, s.lint_config, s.lint_config_version
  FROM spaces s LEFT JOIN pages h ON h.id = s.home_page_id AND h.deleted_at IS NULL`;

const toSpace = (r: SpaceRow): Space => ({
  key: r.key,
  name: r.name,
  description: r.description,
  homePageShortId: r.home_short_id,
  treeVersion: r.tree_version,
  createdAt: r.created_at,
  archivedAt: r.archived_at,
  // Stored configs were validated with their defaults filled in (setLintConfig).
  lintConfig: r.lint_config
    ? (JSON.parse(r.lint_config) as LintConfig)
    : { rules: {}, requiredSections: {} },
  lintConfigVersion: r.lint_config_version,
});

export async function listSpaces(DB: D1Database, includeArchived = false): Promise<Space[]> {
  const where = includeArchived ? '' : 'WHERE s.archived_at IS NULL';
  const { results } = await DB.prepare(`${SELECT_SPACE} ${where} ORDER BY s.key`).all<SpaceRow>();
  return results.map(toSpace);
}

export async function getSpace(DB: D1Database, key: string): Promise<Space> {
  const row = await DB.prepare(`${SELECT_SPACE} WHERE s.key = ?`)
    .bind(key.toUpperCase())
    .first<SpaceRow>();
  if (!row) throw notFound('Space');
  return toSpace(row);
}

/** Creates a space together with its home page (D-35), in one transaction. */
export async function createSpace(
  DB: D1Database,
  actor: Actor,
  input: { key: string; name: string; description?: string },
  now = Date.now(),
): Promise<Space> {
  const spaceId = ulid(now);
  const pageId = ulid(now);
  const shortId = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
    (b % 36).toString(36),
  ).join('');
  const intro = input.description ? `${input.description}\n` : '';
  const content = renderTemplate('note', { owner: actor.email ?? actor.name }) + intro;
  try {
    await DB.batch([
      DB.prepare(
        `INSERT INTO spaces (id, key, name, description, home_page_id, tree_version, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
      ).bind(spaceId, input.key, input.name, input.description ?? null, pageId, now),
      DB.prepare(
        `INSERT INTO pages (id, short_id, space_id, parent_id, position, title, slug, content,
           doc_type, status, owner, revision, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'a0', ?, ?, ?, 'note', 'draft', ?, 1, ?, ?, ?, ?)`,
      ).bind(
        pageId,
        shortId,
        spaceId,
        input.name,
        slugify(input.name),
        content,
        actor.email ?? actor.name,
        actor.id,
        actor.id,
        now,
        now,
      ),
    ]);
  } catch (e) {
    if (e instanceof Error && e.message.includes('spaces.key')) {
      throw new ServiceError(409, 'key-taken', `Space key "${input.key}" is already used`);
    }
    throw e;
  }
  return getSpace(DB, input.key);
}

export async function updateSpace(
  DB: D1Database,
  key: string,
  input: { name?: string; description?: string | null; homePage?: string; archived?: boolean },
  now = Date.now(),
): Promise<Space> {
  const space = await DB.prepare('SELECT id FROM spaces WHERE key = ?')
    .bind(key.toUpperCase())
    .first<{ id: string }>();
  if (!space) throw notFound('Space');

  const sets: string[] = [];
  const binds: unknown[] = [];
  const set = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    binds.push(value);
  };
  if (input.name !== undefined) set('name', input.name);
  if (input.description !== undefined) set('description', input.description);
  if (input.archived !== undefined) set('archived_at', input.archived ? now : null);
  if (input.homePage !== undefined) {
    const home = await DB.prepare(
      'SELECT id FROM pages WHERE (id = ? OR short_id = ?) AND space_id = ? AND deleted_at IS NULL',
    )
      .bind(input.homePage, input.homePage, space.id)
      .first<{ id: string }>();
    if (!home) throw notFound('Home page');
    set('home_page_id', home.id);
  }
  if (sets.length > 0) {
    await DB.prepare(`UPDATE spaces SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...binds, space.id)
      .run();
  }
  return getSpace(DB, key);
}

/**
 * Replaces a space's rule config (D-47). The version bump marks every stored page summary
 * stale, so the dashboard rechecks them (D-46); saves use the new rules right away.
 */
export async function setLintConfig(
  DB: D1Database,
  key: string,
  config: LintConfig,
): Promise<Space> {
  const res = await DB.prepare(
    'UPDATE spaces SET lint_config = ?, lint_config_version = lint_config_version + 1 WHERE key = ?',
  )
    .bind(JSON.stringify(config), key.toUpperCase())
    .run();
  if (!res.meta.changes) throw notFound('Space');
  return getSpace(DB, key);
}
