import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { db } from '../db/client';
import type { Actor } from '../services/actors';
import { findPage, listSpaces, spaceTree } from '../services/wiki';

const INSTRUCTIONS = `Clavis is the team's Markdown wiki: specs, planning docs and architecture.
- Start with list_spaces, then get_space_tree to find pages.
- read_page returns the page's raw Markdown including YAML frontmatter, plus its revision.
- Pages are referenced by short id (e.g. "a1b2c3") or "SPACEKEY:Page title".`;

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const json = (value: unknown) => text(JSON.stringify(value, null, 2));

/**
 * One MCP server per request (stateless transport). The authenticated actor is closed over,
 * so every tool runs with the caller's identity and role.
 */
export function buildMcpServer(env: Env, actor: Actor) {
  const d = db(env.DB);
  const server = new McpServer(
    { name: 'clavis', version: env.APP_VERSION },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    'list_spaces',
    {
      title: 'List spaces',
      description: 'List the wiki spaces (top-level groups) with their keys.',
      annotations: { readOnlyHint: true },
    },
    async () => json({ actor: actor.name, spaces: await listSpaces(d) }),
  );

  server.registerTool(
    'get_space_tree',
    {
      title: 'Get space page tree',
      description: 'Return the page hierarchy of a space: short id, title, type and status.',
      inputSchema: z.object({ space: z.string().describe('Space key, e.g. "PAY"') }),
      annotations: { readOnlyHint: true },
    },
    async ({ space }) => {
      const tree = await spaceTree(d, space);
      return tree ? json(tree) : { ...text(`Space "${space}" not found.`), isError: true };
    },
  );

  server.registerTool(
    'read_page',
    {
      title: 'Read page',
      description:
        'Read a page as raw Markdown (with frontmatter). Returns the revision needed to update it later.',
      inputSchema: z.object({
        page: z.string().describe('Short id (e.g. "a1b2c3") or "SPACEKEY:Page title"'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ page }) => {
      const found = await findPage(d, page);
      if (!found) return { ...text(`Page "${page}" not found.`), isError: true };
      const header = `<!-- clavis: ${found.spaceKey}/${found.shortId} "${found.title}" revision=${found.revision} -->`;
      return text(`${header}\n${found.content}`);
    },
  );

  return server;
}
