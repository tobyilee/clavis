import { splitFrontmatter } from '@clavis/shared/markdown';
import { isMap, isSeq, parseDocument } from 'yaml';

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

/**
 * Sets frontmatter fields, keeping the rest of the YAML (comments, key order, unknown keys)
 * as it was. Creates the frontmatter block if there is none.
 */
export function updateFrontmatter(content: string, patch: Partial<FrontmatterFields>): string {
  const split = splitFrontmatter(content);
  const doc = parseDocument(split.raw ?? '');
  if (doc.errors.length > 0 || !(isMap(doc.contents) || doc.contents === null)) {
    // Unparseable YAML: leave it for the person to fix in the editor.
    return content;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'tags') {
      const node = doc.createNode(value);
      // tags: [a, b] on one line, as in the templates.
      if (isSeq(node)) node.flow = true;
      doc.set(key, node);
    } else {
      doc.set(key, value);
    }
  }
  const yaml = doc.toString();
  const body = split.raw === null ? content : split.body;
  return `---\n${yaml}---\n${body}`;
}
