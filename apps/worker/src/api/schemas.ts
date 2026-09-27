import {
  AttachmentSchema,
  PageSchema,
  SaveResultSchema,
  SearchHitSchema,
  SpaceSchema,
  TemplateSchema,
  TrashEntrySchema,
  TreeNodeSchema,
} from '@clavis/shared/schema';
import { z } from '@hono/zod-openapi';

// Shared zod schemas, registered under OpenAPI component names. The shared package uses
// plain zod; @hono/zod-openapi patches the same zod instance, so .openapi() is available.
export const Space = SpaceSchema.openapi('Space');
export const Page = PageSchema.openapi('Page');
export const TreeNode = TreeNodeSchema.openapi('TreeNode');
export const SaveResult = SaveResultSchema.openapi('SaveResult');
export const SearchHit = SearchHitSchema.openapi('SearchHit');
export const Template = TemplateSchema.openapi('Template');
export const TrashEntry = TrashEntrySchema.openapi('TrashEntry');
export const Attachment = AttachmentSchema.openapi('Attachment');

export const SpaceKeyParam = z.object({
  key: z.string().openapi({ param: { name: 'key', in: 'path' }, example: 'PAY' }),
});
export const PageRefParam = z.object({
  ref: z.string().openapi({
    param: { name: 'ref', in: 'path' },
    description: 'Page id, short id, or "SPACEKEY:Title" (URL-encoded)',
    example: 'a1b2c3',
  }),
});

export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
