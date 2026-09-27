import { z } from 'zod';
import { DOC_STATUSES } from './frontmatter';
import { ViolationSchema } from './problem';

/**
 * API shapes shared by the REST API (zod-openapi), the MCP tools and the web client, so all
 * three agree on one definition. Timestamps are epoch milliseconds.
 */

/** Page content limit (D-33). Larger saves are rejected with 413. */
export const MAX_CONTENT_BYTES = 100 * 1024;

export const SPACE_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
export const SpaceKeySchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(SPACE_KEY_RE, '2-10 uppercase letters or digits, starting with a letter'));

export const PageTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((t) => !/[[\]|\n]/.test(t), 'Titles cannot contain [ ] | or line breaks');

export const ActorRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['human', 'agent']),
});
export type ActorRef = z.infer<typeof ActorRefSchema>;

export const SpaceSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  homePageShortId: z.string().nullable(),
  treeVersion: z.number().int(),
  createdAt: z.number(),
  archivedAt: z.number().nullable(),
});
export type Space = z.infer<typeof SpaceSchema>;

export const CreateSpaceSchema = z.object({
  key: SpaceKeySchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});
export const UpdateSpaceSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  /** Page id or short id to use as the space home. */
  homePage: z.string().optional(),
});

export const PageRefSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  title: z.string(),
  slug: z.string(),
});
export type PageRef = z.infer<typeof PageRefSchema>;

export const PageSummarySchema = PageRefSchema.extend({
  spaceKey: z.string(),
  docType: z.string(),
  status: z.string(),
  owner: z.string().nullable(),
  revision: z.number().int(),
  updatedAt: z.number(),
  updatedBy: ActorRefSchema,
});
export type PageSummary = z.infer<typeof PageSummarySchema>;

export const PageSchema = PageSummarySchema.extend({
  content: z.string(),
  tags: z.array(z.string()),
  parentId: z.string().nullable(),
  /** Root first, excluding the page itself. */
  ancestors: z.array(PageRefSchema),
  createdAt: z.number(),
  createdBy: ActorRefSchema,
});
export type Page = z.infer<typeof PageSchema>;

export interface TreeNode {
  id: string;
  shortId: string;
  title: string;
  slug: string;
  docType: string;
  status: string;
  children: TreeNode[];
}
export const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    shortId: z.string(),
    title: z.string(),
    slug: z.string(),
    docType: z.string(),
    status: z.string(),
    children: z.array(TreeNodeSchema),
  }),
);

export const CreatePageSchema = z.object({
  title: PageTitleSchema,
  /** Full Markdown with frontmatter. Omit to start from `template`. */
  content: z.string().optional(),
  /** Document type whose template fills an omitted `content`. */
  template: z.string().optional(),
  /** Parent page id or short id; omit for a top-level page. */
  parent: z.string().nullable().optional(),
  /** Sibling page id or short id to insert after; omit to append. */
  after: z.string().optional(),
});
export type CreatePageInput = z.infer<typeof CreatePageSchema>;

export const UpdatePageSchema = z.object({
  title: PageTitleSchema.optional(),
  content: z.string(),
  /** The revision this edit is based on; a mismatch returns 409 (optimistic lock). */
  baseRevision: z.number().int().positive(),
});
export type UpdatePageInput = z.infer<typeof UpdatePageSchema>;

export const MovePageSchema = z
  .object({
    /** New parent id or short id; null moves to the top level. Omit to keep the parent. */
    parent: z.string().nullable().optional(),
    after: z.string().optional(),
    before: z.string().optional(),
  })
  .refine((m) => !(m.after && m.before), 'Use either after or before, not both');
export type MovePageInput = z.infer<typeof MovePageSchema>;

/** A saved page without its content: the caller just sent the content (H2: echoing 100KB
 *  back cost the Worker CPU for nothing). */
export const SavedPageSchema = PageSchema.omit({ content: true });
export type SavedPage = z.infer<typeof SavedPageSchema>;

export const SaveResultSchema = z.object({
  page: SavedPageSchema,
  /** Non-blocking lint findings (warnings and info). */
  violations: z.array(ViolationSchema),
  /** After a rename: pages whose [[links]] were rewritten to the new title (D-42 revised). */
  linksUpdated: z.number().int().optional(),
  /** After a rename: pages still linking to the old title (over the rewrite cap, archived,
   *  or saved concurrently); their links are now broken. */
  linksToOldTitle: z.number().int().optional(),
});
export type SaveResult = z.infer<typeof SaveResultSchema>;

export const SearchHitSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  spaceKey: z.string(),
  title: z.string(),
  slug: z.string(),
  docType: z.string(),
  status: z.string(),
  /** Matched text with the hits wrapped in U+E000 / U+E001 markers. */
  snippet: z.string(),
  updatedAt: z.number(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;
/** Private-use markers around search hits in snippets; safe to render as text. */
export const SNIPPET_OPEN = '';
export const SNIPPET_CLOSE = '';

export const TemplateSchema = z.object({
  type: z.string(),
  name: z.string(),
  description: z.string(),
  requiredSections: z.array(z.string()),
  content: z.string(),
});
export type Template = z.infer<typeof TemplateSchema>;

export const TrashEntrySchema = z.object({
  batchId: z.string(),
  spaceKey: z.string(),
  root: PageRefSchema,
  pageCount: z.number().int(),
  deletedAt: z.number(),
  deletedBy: ActorRefSchema.nullable(),
});
export type TrashEntry = z.infer<typeof TrashEntrySchema>;

export const AttachmentSchema = z.object({
  id: z.string(),
  pageId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  createdAt: z.number(),
  createdBy: ActorRefSchema,
  /** Download URL, e.g. /files/{id} */
  url: z.string(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/** A page that links to another (backlinks); may be in another space. */
export const BacklinkSchema = PageRefSchema.extend({ spaceKey: z.string() });
export type Backlink = z.infer<typeof BacklinkSchema>;

const SEVERITY = z.enum(['error', 'warning', 'info']);

/** One rule's findings on one page, as stored for the dashboard (D-46). */
export const RuleSummarySchema = z.object({
  ruleId: z.string(),
  severity: SEVERITY,
  count: z.number().int(),
  /** First line with this finding, to jump to. */
  line: z.number().int(),
});
export type RuleSummary = z.infer<typeof RuleSummarySchema>;

/** A Space's document health: lint results and broken links (D-46). */
export const SpaceHealthSchema = z.object({
  space: z.string(),
  configVersion: z.number().int(),
  totalPages: z.number().int(),
  /** Pages never checked or checked under an older config; recheck them. */
  stalePages: z.number().int(),
  totals: z.object({
    errors: z.number().int(),
    warnings: z.number().int(),
    infos: z.number().int(),
  }),
  rules: z.array(
    z.object({
      ruleId: z.string(),
      severity: SEVERITY,
      pages: z.number().int(),
      count: z.number().int(),
    }),
  ),
  /** Pages with findings, most errors first (at most 200). */
  pages: z.array(
    PageRefSchema.extend({
      errors: z.number().int(),
      warnings: z.number().int(),
      infos: z.number().int(),
      stale: z.boolean(),
      rules: z.array(RuleSummarySchema),
    }),
  ),
  /** Wiki links whose target does not exist, as of now (at most 500 links). */
  brokenLinks: z.array(
    PageRefSchema.extend({
      targets: z.array(z.object({ spaceKey: z.string(), title: z.string() })),
    }),
  ),
});
export type SpaceHealth = z.infer<typeof SpaceHealthSchema>;

export const RecheckResultSchema = z.object({
  checked: z.number().int(),
  /** Pages still to check; call again until 0. */
  remaining: z.number().int(),
});
export type RecheckResult = z.infer<typeof RecheckResultSchema>;

/** A heading and everything under it (D-48); see @clavis/shared/markdown parseSections. */
export const SectionSchema = z.object({
  /** The heading's anchor on the rendered page; pass it (or the heading text) to address it. */
  id: z.string(),
  level: z.number().int(),
  title: z.string(),
  line: z.number().int(),
  endLine: z.number().int(),
  /** Pass back as `baseSectionHash` when replacing this section. */
  hash: z.string(),
});

export const SectionListSchema = z.object({
  revision: z.number().int(),
  sections: z.array(SectionSchema),
});

export const SectionReadSchema = z.object({
  revision: z.number().int(),
  section: SectionSchema,
  /** The section's Markdown, heading line included. */
  content: z.string(),
});

export const UpdateSectionSchema = z
  .object({
    /** replace: new body (a leading heading of the same level replaces the heading too).
     *  append: added after the section's last line. */
    mode: z.enum(['replace', 'append']),
    content: z.string().max(MAX_CONTENT_BYTES),
    /** The section's hash when you read it: the edit fails only if this section changed. */
    baseSectionHash: z.string().optional(),
    /** Strict alternative: fail if anything on the page changed. */
    baseRevision: z.number().int().positive().optional(),
  })
  .refine(
    (u) => u.mode === 'append' || u.baseSectionHash !== undefined || u.baseRevision !== undefined,
    'replace needs baseSectionHash or baseRevision',
  );
export type UpdateSectionInput = z.infer<typeof UpdateSectionSchema>;

/** Frontmatter fields to set without sending the whole page. */
export const PageMetaPatchSchema = z
  .object({
    status: z.enum(DOC_STATUSES).optional(),
    owner: z.string().trim().min(1).max(200).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
    /** Omit to apply the change to whatever the page holds now. */
    baseRevision: z.number().int().positive().optional(),
  })
  .refine(
    (m) => m.status !== undefined || m.owner !== undefined || m.tags !== undefined,
    'Set at least one of status, owner, tags',
  );
export type PageMetaPatch = z.infer<typeof PageMetaPatchSchema>;

/** Comment body limit (D-44). */
export const MAX_COMMENT_BYTES = 10 * 1024;

export const CommentSchema = z.object({
  id: z.string(),
  author: ActorRefSchema,
  /** Markdown. */
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number().nullable(),
});
export type Comment = z.infer<typeof CommentSchema>;

/** A root comment with its replies, oldest first (D-44). */
export const ThreadSchema = CommentSchema.extend({
  /** Heading id (section) the thread is about, or null for the whole page. */
  sectionId: z.string().nullable(),
  resolvedAt: z.number().nullable(),
  resolvedBy: ActorRefSchema.nullable(),
  replies: z.array(CommentSchema),
});
export type Thread = z.infer<typeof ThreadSchema>;

const CommentBody = z
  .string()
  .trim()
  .min(1)
  .refine((b) => new TextEncoder().encode(b).byteLength <= MAX_COMMENT_BYTES, 'At most 10KB');

export const CreateCommentSchema = z.object({
  body: CommentBody,
  /** Reply in this thread (any comment id of it); omit to start a thread. */
  replyTo: z.string().optional(),
  /** New threads only: the section (heading id) this is about. */
  sectionId: z.string().max(200).optional(),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const UpdateCommentSchema = z.object({ body: CommentBody });
