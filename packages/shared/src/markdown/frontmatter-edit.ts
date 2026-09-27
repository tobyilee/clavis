import { isMap, isSeq, parseDocument } from 'yaml';
import { splitFrontmatter } from './frontmatter';

export interface FrontmatterPatch {
  type?: string;
  status?: string;
  owner?: string;
  tags?: string[];
}

/**
 * Sets frontmatter fields, keeping the rest of the YAML (comments, key order, unknown keys)
 * as it was. Creates the frontmatter block if there is none. Unparseable YAML is returned
 * unchanged, for a person to fix.
 */
export function updateFrontmatter(content: string, patch: FrontmatterPatch): string {
  const split = splitFrontmatter(content);
  const doc = parseDocument(split.raw ?? '');
  if (doc.errors.length > 0 || !(isMap(doc.contents) || doc.contents === null)) {
    return content;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
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
