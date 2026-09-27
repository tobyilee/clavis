import type { Element, Root as HastRoot } from 'hast';
import type { Blockquote, Link, Root as MdastRoot, Paragraph, PhrasingContent, Text } from 'mdast';
import { visit } from 'unist-util-visit';

// Clavis Markdown extensions (D-14), as remark/rehype plugins. They run in the browser only;
// the Worker never builds an AST (D-27).

export interface WikiTarget {
  href: string;
  exists: boolean;
}
export type ResolveWiki = (spaceKey: string | null, title: string) => WikiTarget;
export type ResolveAttachment = (filename: string) => string | null;

// Same grammar as @clavis/shared/markdown extractWikiLinks.
const WIKI_LINK_RE = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;
const SPACE_PREFIX_RE = /^([A-Z][A-Z0-9]{1,9}):(.+)$/;

/** [[Title]], [[Title|alias]], [[KEY:Title]] → links. Text inside code is untouched. */
export function remarkWikiLinks(resolve: ResolveWiki) {
  return (tree: MdastRoot) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined || !node.value.includes('[[')) return;
      const out: PhrasingContent[] = [];
      let last = 0;
      for (const m of node.value.matchAll(WIKI_LINK_RE)) {
        const start = m.index ?? 0;
        if (start > last) out.push({ type: 'text', value: node.value.slice(last, start) });
        const target = (m[1] ?? '').trim();
        const prefixed = SPACE_PREFIX_RE.exec(target);
        const spaceKey = prefixed ? (prefixed[1] ?? null) : null;
        const title = prefixed ? (prefixed[2] ?? '').trim() : target;
        const { href, exists } = resolve(spaceKey, title);
        const link: Link = {
          type: 'link',
          url: href,
          children: [{ type: 'text', value: m[2]?.trim() || title }],
          data: {
            hProperties: {
              className: exists ? ['wikilink'] : ['wikilink', 'wikilink-broken'],
              title: exists ? undefined : 'Page does not exist',
            },
          },
        };
        out.push(link);
        last = start + m[0].length;
      }
      if (last === 0) return;
      if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) });
      parent.children.splice(index, 1, ...out);
      return index + out.length;
    });
  };
}

export const CALLOUT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];
const CALLOUT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i;

/** GitHub alerts: a blockquote starting with [!NOTE] etc. becomes a styled callout. */
export function remarkCallouts(labels: Record<CalloutKind, string>) {
  return (tree: MdastRoot) => {
    visit(tree, 'blockquote', (node: Blockquote) => {
      const first = node.children[0];
      if (first?.type !== 'paragraph') return;
      const text = first.children[0];
      if (text?.type !== 'text') return;
      const m = CALLOUT_RE.exec(text.value);
      if (!m?.[1]) return;
      const kind = m[1].toLowerCase() as CalloutKind;
      text.value = text.value.slice(m[0].length);
      if (text.value === '') first.children.shift();
      if (first.children.length === 0) node.children.shift();
      const title: Paragraph = {
        type: 'paragraph',
        children: [{ type: 'text', value: labels[kind] }],
        data: { hProperties: { className: ['callout-title'] } },
      };
      node.children.unshift(title);
      node.data = { hProperties: { className: ['callout', `callout-${kind}`] } };
    });
  };
}

/** attachments/<name> in links and images → the file URL (D-31). */
export function remarkAttachments(resolve: ResolveAttachment) {
  const fix = (url: string) => {
    if (!url.startsWith('attachments/')) return url;
    const name = decodeURIComponent(url.slice('attachments/'.length));
    return resolve(name) ?? '#missing-attachment';
  };
  return (tree: MdastRoot) => {
    visit(tree, (node) => {
      if (node.type === 'image' || node.type === 'link') node.url = fix(node.url);
    });
  };
}

/**
 * Tags block elements with their source line (data-line), for editor ↔ preview scroll
 * sync. `offset` maps body lines back to document lines (the frontmatter comes first).
 */
export function rehypeDataLine(offset: number) {
  const BLOCKS = new Set([
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'table',
    'tr',
    'hr',
  ]);
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      const line = node.position?.start.line;
      if (line !== undefined && BLOCKS.has(node.tagName)) {
        node.properties.dataLine = line + offset;
      }
    });
  };
}

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Collects H2/H3 (after heading ids exist) for the table of contents. */
export function rehypeCollectToc(out: TocItem[]) {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      if (
        (node.tagName === 'h2' || node.tagName === 'h3') &&
        typeof node.properties.id === 'string'
      ) {
        out.push({
          id: node.properties.id,
          text: textOf(node),
          level: node.tagName === 'h2' ? 2 : 3,
        });
      }
    });
  };
}

export function textOf(node: Element | HastRoot): string {
  let s = '';
  visit(node, 'text', (t) => {
    s += t.value;
  });
  return s;
}
