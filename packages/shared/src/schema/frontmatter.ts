import { z } from 'zod';

export const DOC_TYPES = [
  'spec',
  'prd',
  'adr',
  'architecture',
  'meeting',
  'guide',
  'note',
] as const;
export const DOC_STATUSES = ['draft', 'review', 'approved', 'deprecated'] as const;

export type DocType = (typeof DOC_TYPES)[number];
export type DocStatus = (typeof DOC_STATUSES)[number];

export const FrontmatterSchema = z.object({
  type: z.enum(DOC_TYPES),
  status: z.enum(DOC_STATUSES),
  owner: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
});

export type Frontmatter = z.infer<typeof FrontmatterSchema>;
