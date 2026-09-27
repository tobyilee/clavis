import { parse } from 'yaml';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface SplitResult {
  /** Raw YAML between the fences, or null when the document has no frontmatter. */
  raw: string | null;
  /** Parsed YAML value (unvalidated). */
  data: unknown;
  /** YAML syntax error message, if parsing failed. */
  error?: string;
  body: string;
  /** 1-based line number in the full document where the body starts. */
  bodyStartLine: number;
}

export function splitFrontmatter(content: string): SplitResult {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return { raw: null, data: undefined, body: content, bodyStartLine: 1 };

  const raw = match[1] ?? '';
  const bodyStartLine = countLines(match[0]) + 1;
  const body = content.slice(match[0].length);
  try {
    return { raw, data: parse(raw), body, bodyStartLine };
  } catch (e) {
    return { raw, data: undefined, error: (e as Error).message, body, bodyStartLine };
  }
}

function countLines(s: string): number {
  let n = 0;
  for (const ch of s) if (ch === '\n') n++;
  return n;
}
