import type { TreeNode } from '@clavis/shared/schema';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Actor } from '../services/actors';
import { ServiceError } from '../services/errors';
import { getPage, getTree } from '../services/pages';
import { listSpaces } from '../services/spaces';

const INSTRUCTIONS = `Clavis is the team's Markdown wiki: specs, planning docs and architecture.
- Start with list_spaces, then get_space_tree to find pages.
- read_page returns the page's raw Markdown including YAML frontmatter, plus its revision.
- Pages are referenced by short id (e.g. "a1b2c3") or "SPACEKEY:Page title".`;

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const json = (value: unknown) => text(JSON.stringify(value, null, 2));

/** Token-lean tree for agents: ids and slugs are for URLs, not needed to navigate. */
function compactTree(nodes: TreeNode[]): unknown[] {
  return nodes.map(({ shortId, title, docType, status, children }) => ({
    shortId,
    title,
    docType,
    status,
    children: compactTree(children),
  }));
}

/** Turns service failures into MCP tool errors the agent can read and act on. */
async function guard(run: () => Promise<ReturnType<typeof text>>) {
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
    const detail = e.extra.detail ? ` ${e.extra.detail}` : '';
    return { ...text(`${e.title}.${detail}`), isError: true };
  }
}

/**
 * One MCP server per request (stateless transport). The authenticated actor is closed over,
 * so every tool runs with the caller's identity and role.
 */
export function buildMcpServer(env: Env, actor: Actor) {
  const DB = env.DB;
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
    async () =>
      json({
        actor: actor.name,
        spaces: (await listSpaces(DB)).map(({ key, name, description }) => ({
          key,
          name,
          description,
        })),
      }),
  );

  server.registerTool(
    'get_space_tree',
    {
      title: 'Get space page tree',
      description: 'Return the page hierarchy of a space: short id, title, type and status.',
      inputSchema: z.object({ space: z.string().describe('Space key, e.g. "PAY"') }),
      annotations: { readOnlyHint: true },
    },
    async ({ space }) =>
      guard(async () => json(compactTree((await getTree(DB, space))?.tree ?? []))),
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
    async ({ page }) =>
      guard(async () => {
        const found = await getPage(DB, page);
        const header = `<!-- clavis: ${found.spaceKey}/${found.shortId} "${found.title}" revision=${found.revision} -->`;
        return text(`${header}\n${found.content}`);
      }),
  );

  return server;
}
