import { type ScannedLine, stripInlineCode } from './lines';

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
