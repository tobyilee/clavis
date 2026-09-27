import { z } from 'zod';
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

export const SaveResultSchema = z.object({
  page: PageSchema,
  /** Non-blocking lint findings (warnings and info). */
  violations: z.array(ViolationSchema),
  /** Pages still linking to the old title after a rename (D-42). */
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
