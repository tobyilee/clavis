import { type ScannedLine, scanLines, stripInlineCode } from './lines';

export interface WikiLink {
  /** Target space key, or null for the current space. */
  spaceKey: string | null;
  title: string;
  alias: string | null;
  line: number;
  column: number;
}

export interface AttachmentRef {
  filename: string;
  line: number;
  column: number;
}

// [[Title]], [[Title|alias]], [[KEY:Title]], [[KEY:Title|alias]]
const WIKI_LINK_RE = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;
const SPACE_PREFIX_RE = /^([A-Z][A-Z0-9]{1,9}):(.+)$/;
// ](attachments/name.ext) with an optional "title"
const ATTACHMENT_RE = /\]\(\s*<?attachments\/([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

export function extractWikiLinks(lines: ScannedLine[]): WikiLink[] {
  const out: WikiLink[] = [];
  for (const l of lines) {
    if (l.inFence || !l.text.includes('[[')) continue;
    for (const m of stripInlineCode(l.text).matchAll(WIKI_LINK_RE)) {
      const target = (m[1] ?? '').trim();
      const prefixed = SPACE_PREFIX_RE.exec(target);
      out.push({
        spaceKey: prefixed ? (prefixed[1] ?? null) : null,
        title: prefixed ? (prefixed[2] ?? '').trim() : target,
        alias: m[2]?.trim() ?? null,
        line: l.line,
        column: (m.index ?? 0) + 1,
      });
    }
  }
  return out;
}

export function extractAttachmentRefs(lines: ScannedLine[]): AttachmentRef[] {
  const out: AttachmentRef[] = [];
  for (const l of lines) {
    if (l.inFence || !l.text.includes('attachments/')) continue;
    for (const m of stripInlineCode(l.text).matchAll(ATTACHMENT_RE)) {
      out.push({
        filename: decodeURIComponent(m[1] ?? ''),
        line: l.line,
        column: (m.index ?? 0) + 1,
      });
    }
  }
  return out;
}

export interface RenameTarget {
  /** Space of the renamed page. */
  spaceKey: string;
  oldTitle: string;
  newTitle: string;
}

/**
 * Rewrites wiki links to a renamed page: [[Old]] → [[New]], keeping aliases and an explicit
 * KEY: prefix. Unprefixed links only count when the linking page is in the same space
 * (D-23). Fenced code and inline code are left alone. Line endings are preserved.
 */
export function renameWikiLinks(
  content: string,
  linkingSpaceKey: string,
  target: RenameTarget,
): { content: string; count: number } {
  const parts = content.split(/(\r?\n)/);
  const lines = scanLines(parts.filter((_, i) => i % 2 === 0).join('\n'));
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = parts[i * 2];
    if (!line || line.inFence || text === undefined || !text.includes('[[')) continue;
    // Replace only outside inline code spans.
    parts[i * 2] = text.replace(
      /(`+)[\s\S]*?\1|\[\[([^[\]|\n]+?)(\|[^[\]\n]+?)?\]\]/g,
      (m, tick, inner, alias) => {
        if (tick) return m;
        const raw = String(inner).trim();
        const prefixed = SPACE_PREFIX_RE.exec(raw);
        const key = prefixed ? prefixed[1] : linkingSpaceKey;
        const title = prefixed ? (prefixed[2] ?? '').trim() : raw;
        if (key !== target.spaceKey || title !== target.oldTitle) return m;
        count++;
        return `[[${prefixed ? `${prefixed[1]}:` : ''}${target.newTitle}${alias ?? ''}]]`;
      },
    );
  }
  return { content: count > 0 ? parts.join('') : content, count };
}
