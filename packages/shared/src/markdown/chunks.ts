import { splitFrontmatter } from './frontmatter';
import { type SectionHead, sectionHeads } from './sections';

/** About how long a chunk gets before it is split (D-63), in characters. */
export const CHUNK_MAX_CHARS = 2000;
const EXCERPT_CHARS = 160;

/**
 * A piece of a page to embed for semantic search (D-63). A page splits at its H2 headings
 * (H3 and deeper stay with their H2); the text before the first H2 is a chunk of its own,
 * and a piece longer than CHUNK_MAX_CHARS splits at blank lines. Each chunk starts with its
 * title path ("Page › Section"), so a chunk read alone still says what it is about.
 */
export interface Chunk {
  /** The H2's anchor id, as read_section takes it; null for the text before the first H2. */
  sectionId: string | null;
  heading: string | null;
  /** What is embedded: the title path, a blank line, then the Markdown. */
  text: string;
  /** The start of the chunk as plain text, for search results. */
  excerpt: string;
}

export function chunkPage(title: string, content: string): Chunk[] {
  const { heads, lines } = sectionHeads(content);
  const { bodyStartLine } = splitFrontmatter(content);
  const tops = heads.filter((h) => h.level <= 2);
  const end = lines.length + 1;
  const pieces: { head: SectionHead | null; from: number; to: number }[] = [
    { head: null, from: bodyStartLine, to: (tops[0]?.line ?? end) - 1 },
    ...tops.map((h, i) => ({ head: h, from: h.line + 1, to: (tops[i + 1]?.line ?? end) - 1 })),
  ];
  const chunks: Chunk[] = [];
  for (const p of pieces) {
    const body = lines
      .slice(p.from - 1, p.to)
      .join('\n')
      .trim();
    if (!body) continue;
    const path = p.head ? `${title} › ${p.head.title}` : title;
    for (const part of splitLong(body)) {
      chunks.push({
        sectionId: p.head?.id ?? null,
        heading: p.head?.title ?? null,
        text: `${path}\n\n${part}`,
        excerpt: excerpt(part),
      });
    }
  }
  return chunks;
}

/** Joins items with `sep` into strings of at most CHUNK_MAX_CHARS (an item never splits). */
function pack(items: string[], sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const item of items) {
    if (cur && cur.length + sep.length + item.length > CHUNK_MAX_CHARS) {
      out.push(cur);
      cur = item;
    } else {
      cur = cur ? `${cur}${sep}${item}` : item;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Paragraphs first; a paragraph too long by lines; a line too long by characters. */
function splitLong(body: string): string[] {
  if (body.length <= CHUNK_MAX_CHARS) return [body];
  const slices = (line: string) =>
    Array.from({ length: Math.ceil(line.length / CHUNK_MAX_CHARS) }, (_, i) =>
      line.slice(i * CHUNK_MAX_CHARS, (i + 1) * CHUNK_MAX_CHARS),
    );
  const blocks = body
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap((b) =>
      b.length <= CHUNK_MAX_CHARS
        ? [b]
        : pack(
            b.split('\n').flatMap((l) => (l.length <= CHUNK_MAX_CHARS ? [l] : slices(l))),
            '\n',
          ),
    );
  return pack(blocks, '\n\n');
}

/** Markdown reduced to readable text: markers, link targets and table rules dropped. */
function excerpt(md: string): string {
  const plain = md
    .replace(/^\s*(```|~~~).*$/gm, '')
    .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, '')
    .replace(/^ {0,3}(#{1,6}|>|[-*+]( \[[ xX]\])?|\d+[.)])[ \t]+/gm, '')
    .replace(/\[![A-Z]+\]/g, '')
    .replace(/!?\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g, (_, target: string, alias?: string) =>
      (alias ?? target).trim(),
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > EXCERPT_CHARS ? `${plain.slice(0, EXCERPT_CHARS)}…` : plain;
}
