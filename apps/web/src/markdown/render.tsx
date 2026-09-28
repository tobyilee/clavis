import { splitFrontmatter } from '@clavis/shared/markdown';
import type { Root as HastRoot } from 'hast';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import type { ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { markdownComponents } from './components';
import {
  type CalloutKind,
  type ResolveAttachment,
  type ResolveWiki,
  rehypeCollectToc,
  rehypeDataLine,
  remarkAttachments,
  remarkCallouts,
  remarkWikiLinks,
  type TocItem,
} from './plugins';

export interface RenderContext {
  resolveWiki: ResolveWiki;
  resolveAttachment: ResolveAttachment;
  calloutLabels: Record<CalloutKind, string>;
}

// Raw HTML never reaches the tree (remark-rehype drops it), so the sanitizer is a second
// line of defense. It only needs to allow the classes and data-line our own plugins add.
/** Adds allowed className values to a tag, merged with any the default schema allows. */
function withClasses(tag: string, classes: string[]) {
  const base = defaultSchema.attributes?.[tag] ?? [];
  const existing = base.find((a) => Array.isArray(a) && a[0] === 'className');
  const others = base.filter((a) => a !== existing);
  const values = Array.isArray(existing) ? existing.slice(1) : [];
  return [...others, ['className', ...values, ...classes]] as typeof base;
}

const schema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'dataLine'],
    a: withClasses('a', ['wikilink', 'wikilink-broken']),
    blockquote: withClasses('blockquote', [
      'markdown-alert',
      'markdown-alert-note',
      'markdown-alert-tip',
      'markdown-alert-important',
      'markdown-alert-warning',
      'markdown-alert-caution',
    ]),
    p: withClasses('p', ['markdown-alert-title']),
  },
};

export interface Rendered {
  element: ReactNode;
  toc: TocItem[];
}

/** Markdown (with frontmatter) → sanitized HTML tree plus table of contents. */
export function markdownToHast(
  content: string,
  ctx: RenderContext,
): { hast: HastRoot; toc: TocItem[] } {
  const { body, bodyStartLine } = splitFrontmatter(content);
  const toc: TocItem[] = [];
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkWikiLinks, ctx.resolveWiki)
    .use(remarkCallouts, ctx.calloutLabels)
    .use(remarkAttachments, ctx.resolveAttachment)
    .use(remarkRehype)
    .use(rehypeDataLine, bodyStartLine - 1)
    .use(rehypeSanitize, schema)
    .use(rehypeSlug)
    .use(rehypeCollectToc, toc);
  const hast = processor.runSync(processor.parse(body)) as HastRoot;
  return { hast, toc };
}

/**
 * Markdown (with frontmatter) → React, synchronously, so the editor preview can call it on
 * every change. Code highlighting and diagrams load lazily inside the components.
 */
export function renderMarkdown(content: string, ctx: RenderContext): Rendered {
  const { hast, toc } = markdownToHast(content, ctx);
  const element = toJsxRuntime(hast, {
    Fragment,
    jsx,
    jsxs,
    components: markdownComponents,
    // Components such as Pre inspect the hast node (language, source text).
    passNode: true,
  });
  return { element, toc };
}
