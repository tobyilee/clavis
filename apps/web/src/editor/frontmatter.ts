import {
  splitFrontmatter,
  updateFrontmatter as updateSharedFrontmatter,
} from '@clavis/shared/markdown';

export interface FrontmatterFields {
  type: string;
  status: string;
  owner: string;
  tags: string[];
}

/** Reads the form fields from a document's frontmatter, tolerating partial or broken YAML. */
export function readFrontmatter(content: string): { fields: FrontmatterFields; valid: boolean } {
  const split = splitFrontmatter(content);
  const data = (split.data ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  return {
    fields: {
      type: str(data.type),
      status: str(data.status),
      owner: str(data.owner),
      tags: Array.isArray(data.tags) ? data.tags.map(str).filter(Boolean) : [],
    },
    valid: split.raw !== null && !split.error,
  };
}

/** Shared with the server's meta patch (PATCH /pages/{ref}/meta). */
export function updateFrontmatter(content: string, patch: Partial<FrontmatterFields>): string {
  return updateSharedFrontmatter(content, patch);
}
