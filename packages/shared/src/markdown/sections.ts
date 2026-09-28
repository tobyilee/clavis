import GithubSlugger from 'github-slugger';
import { headings } from '../lint/rules/headings';
import { splitFrontmatter } from './frontmatter';
import { scanLines } from './lines';

/**
 * Sections for editing part of a page (D-48). A section is a heading and everything under
 * it, up to the next heading of the same or a higher level; subsections are part of it.
 */
export interface Section {
  /** The heading's anchor on the rendered page (rehype-slug), e.g. "액션-아이템". */
  id: string;
  level: number;
  /** Heading text as written. */
  title: string;
  /** 1-based lines in the full document, both inclusive; `line` is the heading. */
  line: number;
  endLine: number;
  /** Hash of the section text; an edit based on it fails if the section changed since. */
  hash: string;
}

/**
 * Approximates the heading's rendered text, which rehype-slug slugs: inline code, links,
 * wiki links (their label), emphasis and HTML reduce to their text.
 */
function renderedText(md: string): string {
  return md
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g, (_, target: string, alias?: string) =>
      (alias ?? target.replace(/^[A-Z][A-Z0-9]{1,9}:/, '')).trim(),
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*{1,3}|~~)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/(^|\W)_{1,3}(\S(?:.*?\S)?)_{1,3}(?=\W|$)/g, '$1$2')
    .replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

/** 32-bit FNV-1a as 8 hex digits: cheap and synchronous, enough to notice a change. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A section before its hash is computed; hashing reads the whole section text. */
export type SectionHead = Omit<Section, 'hash'>;

function sectionHeads(content: string): { heads: SectionHead[]; lines: string[] } {
  const split = splitFrontmatter(content);
  const found = headings(scanLines(split.body, split.bodyStartLine));
  const lines = content.split('\n');
  const slugger = new GithubSlugger();
  const heads = found.map((h, i) => {
    const next = found.slice(i + 1).find((n) => n.level <= h.level);
    return {
      id: slugger.slug(renderedText(h.text)),
      level: h.level,
      title: h.text,
      line: h.line,
      endLine: next ? next.line - 1 : lines.length,
    };
  });
  return { heads, lines };
}

const withHash = (lines: string[], h: SectionHead): Section => ({
  ...h,
  hash: fnv1a(lines.slice(h.line - 1, h.endLine).join('\n')),
});

export function parseSections(content: string): Section[] {
  const { heads, lines } = sectionHeads(content);
  return heads.map((h) => withHash(lines, h));
}

export function sectionText(content: string, s: SectionHead): string {
  return content
    .split('\n')
    .slice(s.line - 1, s.endLine)
    .join('\n');
}

const normTitle = (t: string) =>
  t
    .replace(/^\s*#{1,6}\s+/, '')
    .trim()
    .toLowerCase();

export type SectionLookup<T extends SectionHead = Section> =
  | { section: T }
  | { error: 'not-found' | 'ambiguous'; candidates: T[] };

/** Finds a section by id, else by heading text ("액션 아이템" or "## 액션 아이템"). */
export function findSection<T extends SectionHead>(sections: T[], ref: string): SectionLookup<T> {
  const byId = sections.find((s) => s.id === ref);
  if (byId) return { section: byId };
  const want = normTitle(ref);
  const byTitle = sections.filter((s) => normTitle(s.title) === want);
  if (byTitle.length === 1 && byTitle[0]) return { section: byTitle[0] };
  return byTitle.length > 1
    ? { error: 'ambiguous', candidates: byTitle }
    : { error: 'not-found', candidates: sections };
}

/**
 * findSection on the page's content, hashing only the section found: an edit needs one hash,
 * and hashing every section would read the whole page once more (CPU on the Worker).
 */
export function locateSection(
  content: string,
  ref: string,
): { section: Section } | Exclude<SectionLookup<SectionHead>, { section: SectionHead }> {
  const { heads, lines } = sectionHeads(content);
  const found = findSection(heads, ref);
  return 'section' in found ? { section: withHash(lines, found.section) } : found;
}

const HEADING_RE = /^ {0,3}(#{1,6})[ \t]/;
const LIST_OR_TABLE_RE = /^\s*([-*+][ \t]|\d+[.)][ \t]|\|)/;

/**
 * Returns the content with one section edited.
 * - replace: the section's body becomes `text`. When `text` starts with a heading of the
 *   section's level, it replaces the heading too (so a read section can be sent back whole).
 * - append: `text` goes after the section's last non-blank line (subsections included). A
 *   list item or table row joins a list or table there; anything else starts a new block.
 */
export function editSection(
  content: string,
  s: SectionHead,
  mode: 'replace' | 'append',
  text: string,
): string {
  const lines = content.split('\n');
  const incoming = text.replace(/\s+$/, '').split('\n');
  const before = lines.slice(0, s.line - 1);
  const section = lines.slice(s.line - 1, s.endLine);
  const after = lines.slice(s.endLine);
  const atEnd = after.length === 0;

  let edited: string[];
  if (mode === 'replace') {
    const first = incoming.findIndex((l) => l.trim() !== '');
    const m = first >= 0 ? HEADING_RE.exec(incoming[first] ?? '') : null;
    const withHeading = m?.[1]?.length === s.level;
    const heading = withHeading ? (incoming[first] ?? '') : (section[0] ?? '');
    const body = withHeading ? incoming.slice(first + 1) : incoming;
    while (body.length > 0 && body[0]?.trim() === '') body.shift();
    edited = [heading, ...(body.length > 0 ? ['', ...body] : [])];
    // A blank line before the next heading; at the end, the file's final newline as it was.
    if (!atEnd || content.endsWith('\n')) edited.push('');
  } else {
    let last = section.length - 1;
    while (last > 0 && section[last]?.trim() === '') last--;
    const joins =
      LIST_OR_TABLE_RE.test(section[last] ?? '') && LIST_OR_TABLE_RE.test(incoming[0] ?? '');
    edited = [
      ...section.slice(0, last + 1),
      ...(joins ? [] : ['']),
      ...incoming,
      ...section.slice(last + 1),
    ];
    // A section that ran to the end of a file without a trailing blank line.
    if (!atEnd && edited.at(-1)?.trim() !== '') edited.push('');
  }
  return [...before, ...edited, ...after].join('\n');
}
