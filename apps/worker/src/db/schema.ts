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
  /** 1 = no "page changed" notifications for edits by agents (N5). */
  muteAgentEdits: integer('mute_agent_edits').notNull().default(0),
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
    // Recent changes on the home page (P2).
    index('pages_updated').on(t.updatedAt).where(sql`${t.deletedAt} IS NULL`),
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

/**
 * Version history (D-54): one row per saved revision. The text lives in R2 at
 * rev/{pageId}/{revision}.md (see services/revisions.ts); the row is written in the save's
 * own batch, so a save still makes two D1 calls. `baseline` is a page's text from before
 * history began, kept the first time the page is saved after that.
 */
export const pageRevisions = sqliteTable(
  'page_revisions',
  {
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id),
    revision: integer('revision').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => actors.id),
    createdAt: createdAt(),
    title: text('title').notNull(),
    bytes: integer('bytes').notNull(),
    /** create | update | link-rewrite | restore | baseline */
    kind: text('kind').notNull(),
    /** For kind = restore: the revision whose text came back. */
    restoredFrom: integer('restored_from'),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.revision] })],
);

/**
 * Page comments (D-44): a thread is a root comment plus replies one level deep. Roots may
 * point at a section (heading id) and are resolved as a whole. A root with replies cannot be
 * deleted (resolve it instead), so deletes remove the row.
 */
export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id),
    /** The root comment's id; a root has thread_id = id. */
    threadId: text('thread_id').notNull(),
    authorId: text('author_id')
      .notNull()
      .references(() => actors.id),
    /** Markdown, at most 10KB. */
    body: text('body').notNull(),
    /** Roots only: the heading id the thread is about (D-48 section ids). */
    sectionId: text('section_id'),
    createdAt: createdAt(),
    updatedAt: integer('updated_at'),
    resolvedAt: integer('resolved_at'),
    resolvedBy: text('resolved_by').references(() => actors.id),
  },
  (t) => [
    index('comments_page').on(t.pageId, t.threadId, t.createdAt),
    index('comments_open')
      .on(t.pageId)
      .where(sql`${t.id} = ${t.threadId} AND ${t.resolvedAt} IS NULL`),
  ],
);

/**
 * Semantic search chunks (D-63): one row per vector in Vectorize. The id is
 * "{pageId}:{hash of the embedded text}", so an unchanged chunk keeps its vector and only new
 * text is embedded (D-62). Rows hold what a search result shows; the text itself is not kept.
 */
export const pageChunks = sqliteTable(
  'page_chunks',
  {
    id: text('id').primaryKey(),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id),
    ord: integer('ord').notNull(),
    /** The H2's anchor id; NULL for the text before the first H2. */
    sectionId: text('section_id'),
    heading: text('heading'),
    excerpt: text('excerpt').notNull(),
    chars: integer('chars').notNull(),
  },
  (t) => [index('page_chunks_page').on(t.pageId)],
);

/** The revision each page's chunks reflect; a page whose revision differs awaits indexing. */
export const pageIndex = sqliteTable('page_index', {
  pageId: text('page_id')
    .primaryKey()
    .references(() => pages.id),
  revision: integer('revision').notNull(),
  indexedAt: integer('indexed_at').notNull(),
});

/**
 * Custom page templates (D-49): per space, or for every space when space_id is NULL. The
 * seven built-in templates live in code (@clavis/shared/templates) and are not stored.
 */
export const templates = sqliteTable(
  'templates',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id').references(() => spaces.id),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    /** From the content's frontmatter, for grouping and required sections. */
    docType: text('doc_type').notNull(),
    content: text('content').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => actors.id),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => actors.id),
    createdAt: createdAt(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('templates_space').on(t.spaceId)],
);

/** A person's starred pages (P1). */
export const favorites = sqliteTable(
  'favorites',
  {
    actorId: text('actor_id')
      .notNull()
      .references(() => actors.id),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.actorId, t.pageId] })],
);

/**
 * The pages a person viewed last, one row per page, the newest 50 kept (D-50). Written after
 * the response (waitUntil), so reading a page is not slowed down.
 */
export const pageViews = sqliteTable(
  'page_views',
  {
    actorId: text('actor_id')
      .notNull()
      .references(() => actors.id),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id),
    viewedAt: integer('viewed_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.actorId, t.pageId] }),
    index('page_views_recent').on(t.actorId, t.viewedAt),
  ],
);

/**
 * A person's explicit choice for one page (N2): `watch` adds it to their notifications,
 * `mute` silences it even when they would be notified anyway (creator, owner, commenter).
 */
/**
 * A space's outbound channel (D-58, D-60): a Slack Incoming Webhook or any HTTPS endpoint
 * taking signed JSON. The URL is a secret (Slack's carries its token), so the API masks it.
 */
export const webhooks = sqliteTable(
  'webhooks',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id),
    kind: text('kind', { enum: ['slack', 'json'] }).notNull(),
    url: text('url').notNull(),
    /** HMAC-SHA256 key for X-Clavis-Signature (json). */
    secret: text('secret').notNull(),
    /** JSON array of event names. */
    events: text('events').notNull(),
    enabled: integer('enabled').notNull().default(1),
    createdBy: text('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: createdAt(),
  },
  (t) => [index('webhooks_space').on(t.spaceId)],
);

/**
 * Recent delivery attempts per webhook (the newest 50 are kept). `event_key` identifies the
 * event, so a retried queue message does not post twice.
 */
export const webhookDeliveries = sqliteTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    webhookId: text('webhook_id')
      .notNull()
      .references(() => webhooks.id),
    eventKey: text('event_key').notNull(),
    event: text('event').notNull(),
    pageId: text('page_id'),
    actorId: text('actor_id'),
    attempt: integer('attempt').notNull(),
    /** HTTP status, or null when the request itself failed. */
    status: integer('status'),
    ok: integer('ok').notNull(),
    error: text('error'),
    at: integer('at').notNull(),
  },
  (t) => [
    index('webhook_deliveries_recent').on(t.webhookId, t.at),
    index('webhook_deliveries_event').on(t.webhookId, t.eventKey),
  ],
);

export const watches = sqliteTable(
  'watches',
  {
    actorId: text('actor_id')
      .notNull()
      .references(() => actors.id),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id),
    mode: text('mode', { enum: ['watch', 'mute'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.actorId, t.pageId] }), index('watches_page').on(t.pageId)],
);

/**
 * In-app notifications (D-57). Written by the event queue consumer. While unread, one row
 * per recipient, kind and page absorbs repeats (N5: "Adam edited this 5 times"): the unique
 * index covers unread rows only, so a read row lets the next one start fresh.
 */
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => actors.id),
    /** page.changed | comment | mention */
    kind: text('kind').notNull(),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id),
    /** The latest actor. */
    actorId: text('actor_id')
      .notNull()
      .references(() => actors.id),
    /** comment, mention: the latest comment. */
    commentId: text('comment_id'),
    /** page.changed: the revision before the first unread change, and the latest one. */
    fromRevision: integer('from_revision'),
    toRevision: integer('to_revision'),
    count: integer('count').notNull().default(1),
    firstAt: integer('first_at').notNull(),
    lastAt: integer('last_at').notNull(),
    readAt: integer('read_at'),
  },
  (t) => [
    uniqueIndex('notifications_unread')
      .on(t.recipientId, t.kind, t.pageId)
      .where(sql`${t.readAt} IS NULL`),
    index('notifications_recent').on(t.recipientId, t.lastAt),
  ],
);

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
