import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Timestamps are epoch milliseconds.
const createdAt = () => integer('created_at').notNull();

/** People and AI agents share one table so authorship works the same for both (arch §4.2). */
export const actors = sqliteTable('actors', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['human', 'agent'] }).notNull(),
  name: text('name').notNull(),
  email: text('email').unique(),
  /** 'pending' humans have logged in but await Admin approval (D-29 revised). */
  role: text('role', { enum: ['admin', 'editor', 'viewer', 'pending'] }).notNull(),
  locale: text('locale').notNull().default('ko'),
  createdAt: createdAt(),
  disabledAt: integer('disabled_at'),
});

export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  actorId: text('actor_id')
    .notNull()
    .references(() => actors.id),
  tokenHash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  lastUsedAt: integer('last_used_at'),
  createdAt: createdAt(),
  revokedAt: integer('revoked_at'),
});

export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  homePageId: text('home_page_id'),
  treeVersion: integer('tree_version').notNull().default(0),
  /** The tree as served, built on the first read after a change (H2: 500 pages cost ~7ms). */
  treeJson: text('tree_json'),
  treeJsonVersion: integer('tree_json_version'),
  /** LintConfig JSON (D-47); NULL means the defaults. */
  lintConfig: text('lint_config'),
  /** Bumped on every config change; page_lint rows from older versions are stale (D-46). */
  lintConfigVersion: integer('lint_config_version').notNull().default(0),
  createdAt: createdAt(),
  archivedAt: integer('archived_at'),
});

export const pages = sqliteTable(
  'pages',
  {
    id: text('id').primaryKey(),
    shortId: text('short_id').notNull().unique(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id),
    parentId: text('parent_id'),
    /** Fractional index for sibling order (D-32). */
    position: text('position').notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    /** Source of truth: full Markdown including frontmatter (D-28). */
    content: text('content').notNull(),
    // Derived from the frontmatter at save time, for filtering.
    docType: text('doc_type').notNull(),
    status: text('status').notNull(),
    owner: text('owner'),
    /** Optimistic lock counter, not a history (D-21). */
    revision: integer('revision').notNull().default(1),
    createdBy: text('created_by')
      .notNull()
      .references(() => actors.id),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => actors.id),
    createdAt: createdAt(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    /** Pages deleted together (a subtree) share a batch and are restored together. */
    deletedBatch: text('deleted_batch'),
    deletedBy: text('deleted_by').references(() => actors.id),
  },
  (t) => [
    uniqueIndex('pages_title_uniq').on(t.spaceId, t.title).where(sql`${t.deletedAt} IS NULL`),
    index('pages_tree').on(t.spaceId, t.parentId, t.position).where(sql`${t.deletedAt} IS NULL`),
    index('pages_deleted_batch').on(t.deletedBatch),
  ],
);

export const pageTags = sqliteTable(
  'page_tags',
  {
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id),
    tag: text('tag').notNull(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.tag] }), index('page_tags_tag').on(t.tag)],
);

export const pageLinks = sqliteTable(
  'page_links',
  {
    fromPageId: text('from_page_id')
      .notNull()
      .references(() => pages.id),
    targetSpaceKey: text('target_space_key').notNull(),
    targetTitle: text('target_title').notNull(),
    /** NULL when the target does not resolve (broken link). */
    toPageId: text('to_page_id'),
  },
  (t) => [
    primaryKey({ columns: [t.fromPageId, t.targetSpaceKey, t.targetTitle] }),
    index('page_links_to').on(t.toPageId),
    index('page_links_target').on(t.targetSpaceKey, t.targetTitle),
  ],
);

/**
 * Each page's lint result under its Space config, for the dashboard (D-46). Written by every
 * save and by rechecks. Wiki link findings are left out: they change when other pages do, so
 * the dashboard reads page_links instead.
 */
export const pageLint = sqliteTable('page_lint', {
  pageId: text('page_id')
    .primaryKey()
    .references(() => pages.id),
  /** The page revision that was checked; a recheck never overwrites a newer save. */
  revision: integer('revision').notNull(),
  configVersion: integer('config_version').notNull(),
  errors: integer('errors').notNull(),
  warnings: integer('warnings').notNull(),
  infos: integer('infos').notNull(),
  /** {"<ruleId>": {"s": severity, "n": count, "l": first line}} */
  rules: text('rules').notNull(),
  checkedAt: integer('checked_at').notNull(),
});

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id),
    filename: text('filename').notNull(),
    r2Key: text('r2_key').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('attachments_page_filename').on(t.pageId, t.filename)],
);
