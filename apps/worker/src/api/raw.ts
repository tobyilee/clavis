import { pageSlugId, parseSlugId, type TreeNode } from '@clavis/shared/schema';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { requireRole } from '../auth/middleware';
import { notFound } from '../services/errors';
import { getPage, getTreeNodes } from '../services/pages';
import { getSpace, listSpaces } from '../services/spaces';

/**
 * Plain-text views for AI tools (D-51): a page's Markdown at its URL plus ".md", and an
 * llms.txt index per space and for the whole wiki. Behind Access like everything else, so
 * agents need their service token; people can open them in the browser.
 */
export const raw = new Hono<AppEnv>();

const MARKDOWN = { 'content-type': 'text/markdown; charset=utf-8' };
const TEXT = { 'content-type': 'text/plain; charset=utf-8' };

const pageUrl = (origin: string, key: string, p: { slug: string; shortId: string }) =>
  `${origin}/s/${key}/p/${encodeURI(pageSlugId(p.slug, p.shortId))}.md`;

raw.get('/s/:key/p/:file{.+\\.md}', requireRole('viewer'), async (c) => {
  const key = c.req.param('key').toUpperCase();
  const shortId = parseSlugId(c.req.param('file').slice(0, -'.md'.length));
  if (!shortId) throw notFound('Page');
  const page = await getPage(c.env.DB, shortId);
  if (page.spaceKey !== key) throw notFound('Page');
  return c.body(page.content, 200, {
    ...MARKDOWN,
    'x-clavis-revision': String(page.revision),
    'x-clavis-page': `${page.spaceKey}/${page.shortId}`,
  });
});

raw.get('/s/:key/llms.txt', requireRole('viewer'), async (c) => {
  const origin = new URL(c.req.url).origin;
  const space = await getSpace(c.env.DB, c.req.param('key'));
  const tree = await getTreeNodes(c.env.DB, space.key);
  const lines = [
    `# ${space.name} (${space.key})`,
    '',
    `> ${space.description?.replace(/\s+/g, ' ') || `A space of the Clavis team wiki.`}`,
    '',
    'Pages are Markdown with YAML frontmatter (type, status, owner, tags). Links below are the raw source; drop ".md" for the rendered page.',
    '',
    '## Pages',
    '',
  ];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      lines.push(
        `${'  '.repeat(depth)}- [${n.title}](${pageUrl(origin, space.key, n)}): ${n.docType}, ${n.status}`,
      );
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return c.body(`${lines.join('\n')}\n`, 200, TEXT);
});

raw.get('/llms.txt', requireRole('viewer'), async (c) => {
  const origin = new URL(c.req.url).origin;
  const spaces = await listSpaces(c.env.DB);
  const lines = [
    '# Clavis',
    '',
    "> The team's Markdown wiki: specs, planning docs and architecture.",
    '',
    'Each space lists its pages in its own llms.txt. Agents can also use the MCP server at /mcp or the REST API described at /api/v1/openapi.json.',
    '',
    '## Spaces',
    '',
    ...spaces.map(
      (s) =>
        `- [${s.name} (${s.key})](${origin}/s/${s.key}/llms.txt)${s.description ? `: ${s.description.replace(/\s+/g, ' ')}` : ''}`,
    ),
  ];
  return c.body(`${lines.join('\n')}\n`, 200, TEXT);
});
