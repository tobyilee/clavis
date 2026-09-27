import {
  DOC_STATUSES,
  DOC_TYPES,
  type Page,
  PageTitleSchema,
  pageSlugId,
  type SavedPage,
  SNIPPET_CLOSE,
  SNIPPET_OPEN,
  type TreeNode,
  type Violation,
} from '@clavis/shared/schema';
import { TEMPLATES } from '@clavis/shared/templates';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Actor } from '../services/actors';
import { ServiceError } from '../services/errors';
import { lintContent } from '../services/links';
import {
  createPage,
  deletePage,
  getPage,
  getTreeNodes,
  movePage,
  updatePage,
} from '../services/pages';
import { searchPages } from '../services/search';
import { listSpaces } from '../services/spaces';

const INSTRUCTIONS = `Clavis is the team's Markdown wiki: specs, planning docs and architecture.
Pages are referenced by short id (e.g. "a1b2c3") or "SPACEKEY:Page title".

Reading
- Find pages with search_pages, or list_spaces then get_space_tree.
- read_page returns raw Markdown including YAML frontmatter, plus the page's revision.

Writing (editor agents)
- Every page starts with frontmatter: type (spec|prd|adr|architecture|meeting|guide|note),
  status (draft|review|approved|deprecated), owner, tags. Saves with errors are rejected.
- The page title is the \`title\` argument, not frontmatter, and not an H1 in the body.
- New documents: call list_templates and pass \`template\` to create_page, so the page
  starts with the sections its type requires.
- Before update_page, read_page to get the current revision and pass it as baseRevision.
  If someone saved in between you get a conflict: read again and reapply your change.
- Link pages with [[Page title]] or [[SPACEKEY:Page title]]; attachments with
  ![alt](attachments/file.png).
- Warnings do not block a save, but fix them when you can; lint_markdown checks a draft.
- delete_page moves a page and its children to the trash (restorable for 30 days).`;

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const json = (value: unknown) => text(JSON.stringify(value, null, 2));

type ToolResult = ReturnType<typeof text> & { isError?: boolean };

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

/** One line per finding: "L12 warning clavis/heading-increment: message". */
function formatViolations(violations: Violation[]): string {
  return violations
    .map(
      (v) =>
        `- L${v.line}${v.column ? `:${v.column}` : ''} ${v.severity} ${v.ruleId}: ${v.message}`,
    )
    .join('\n');
}

/** Turns service failures into MCP tool errors the agent can read and act on. */
async function guard(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
    const lines = [`${e.title}.`];
    if (e.extra.detail) lines.push(e.extra.detail);
    if (e.slug === 'revision-conflict') {
      lines.push('Call read_page to get the latest content and revision, then reapply your edit.');
    }
    if (e.extra.violations?.length) {
      lines.push(
        'Nothing was saved. Fix these and try again:',
        formatViolations(e.extra.violations),
      );
    }
    return { ...text(lines.join('\n')), isError: true };
  }
}

const pageArg = z.string().describe('Short id (e.g. "a1b2c3") or "SPACEKEY:Page title"');

/**
 * Tool input schemas, built once per isolate. The server itself must be new per request
 * (stateless transport), but rebuilding every zod schema each time showed up in request
 * CPU (H2).
 */
const INPUT = {
  get_space_tree: z.object({ space: z.string().describe('Space key, e.g. "PAY"') }),
  read_page: z.object({ page: pageArg }),
  search_pages: z.object({
    query: z.string().min(1).max(200),
    space: z.string().optional().describe('Limit to a space key'),
    type: z.enum(DOC_TYPES).optional(),
    status: z.enum(DOC_STATUSES).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  list_templates: z.object({ locale: z.enum(['ko', 'en']).optional() }),
  lint_markdown: z.object({
    content: z.string().max(200_000),
    space: z.string().optional(),
    page: z.string().optional().describe('Short id of the page the content belongs to'),
  }),
  create_page: z.object({
    space: z.string().describe('Space key, e.g. "PAY"'),
    title: PageTitleSchema,
    content: z.string().optional(),
    template: z.enum(DOC_TYPES).optional(),
    parent: z.string().optional().describe('Parent page short id; omit for top level'),
    after: z.string().optional().describe('Sibling short id to place the page after'),
  }),
  update_page: z.object({
    page: pageArg,
    content: z.string().describe('Full Markdown including frontmatter'),
    baseRevision: z.number().int().positive(),
    title: PageTitleSchema.optional().describe(
      'New title; renaming breaks [[links]] to the old one',
    ),
  }),
  move_page: z.object({
    page: pageArg,
    parent: z
      .string()
      .nullable()
      .optional()
      .describe('New parent short id, null for top level; omit to keep the parent'),
    after: z.string().optional().describe('Sibling short id to place after'),
    before: z.string().optional().describe('Sibling short id to place before'),
  }),
  delete_page: z.object({ page: pageArg }),
};

/**
 * One MCP server per request (stateless transport). The authenticated actor is closed over,
 * so every tool runs with the caller's identity and role. `origin` makes page links absolute.
 */
export function buildMcpServer(env: Env, actor: Actor, origin = '') {
  const DB = env.DB;
  const server = new McpServer(
    { name: 'clavis', version: env.APP_VERSION },
    { instructions: INSTRUCTIONS },
  );
  const canWrite = actor.role === 'editor' || actor.role === 'admin';
  const pageUrl = (p: Pick<Page, 'spaceKey' | 'slug' | 'shortId'>) =>
    `${origin}/s/${p.spaceKey}/p/${encodeURI(pageSlugId(p.slug, p.shortId))}`;
  const saved = (verb: string, page: SavedPage, violations: Violation[], extra: string[] = []) => {
    const lines = [
      `${verb} ${page.spaceKey}/${page.shortId} "${page.title}" revision=${page.revision}`,
      pageUrl(page),
      ...extra,
    ];
    if (violations.length > 0) {
      lines.push(`Warnings (${violations.length}), saved anyway:`, formatViolations(violations));
    }
    return text(lines.join('\n'));
  };

  // ── Read ──────────────────────────────────────────────────────────────────

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
      inputSchema: INPUT.get_space_tree,
      annotations: { readOnlyHint: true },
    },
    async ({ space }) => guard(async () => json(compactTree(await getTreeNodes(DB, space)))),
  );

  server.registerTool(
    'read_page',
    {
      title: 'Read page',
      description:
        'Read a page as raw Markdown (with frontmatter). Returns the revision needed to update it later.',
      inputSchema: INPUT.read_page,
      annotations: { readOnlyHint: true },
    },
    async ({ page }) =>
      guard(async () => {
        const found = await getPage(DB, page);
        const header = `<!-- clavis: ${found.spaceKey}/${found.shortId} "${found.title}" revision=${found.revision} updated_by=${found.updatedBy.name} -->`;
        return text(`${header}\n${found.content}`);
      }),
  );

  server.registerTool(
    'search_pages',
    {
      title: 'Search pages',
      description:
        'Full-text search over titles and content. Terms are ANDed; Korean and English substrings match.',
      inputSchema: INPUT.search_pages,
      annotations: { readOnlyHint: true },
    },
    async ({ query, ...filters }) =>
      guard(async () => {
        const { hits, more } = await searchPages(DB, { q: query, ...filters });
        if (hits.length === 0) return text(`No pages match "${query}".`);
        const lines = hits.map((h) => {
          const snippet = h.snippet
            .replaceAll(SNIPPET_OPEN, '**')
            .replaceAll(SNIPPET_CLOSE, '**')
            .replace(/\s+/g, ' ')
            .trim();
          return `- ${h.spaceKey}/${h.shortId} "${h.title}" [${h.docType}, ${h.status}]\n  ${snippet}`;
        });
        if (more) lines.push('(more results: narrow the query or raise limit)');
        return text(lines.join('\n'));
      }),
  );

  server.registerTool(
    'list_templates',
    {
      title: 'List templates',
      description:
        'Document types with their required sections. Pass the type as `template` to create_page.',
      inputSchema: INPUT.list_templates,
      annotations: { readOnlyHint: true },
    },
    async ({ locale = 'ko' }) =>
      json(
        TEMPLATES.map((t) => ({
          type: t.type,
          name: t.name[locale],
          requiredSections: t.sections.map((s) => s[locale]),
        })),
      ),
  );

  server.registerTool(
    'lint_markdown',
    {
      title: 'Lint Markdown',
      description:
        'Check Markdown against the wiki rules without saving. Give `space` to check wiki links, `page` to also check attachments.',
      inputSchema: INPUT.lint_markdown,
      annotations: { readOnlyHint: true },
    },
    async ({ content, space, page }) =>
      guard(async () => {
        const violations = await lintContent(DB, content, { space, page });
        if (violations.length === 0) return text('No problems found.');
        const errors = violations.filter((v) => v.severity === 'error').length;
        const head = errors > 0 ? `${errors} error(s) would block saving.` : 'Saving is allowed.';
        return text(`${head}\n${formatViolations(violations)}`);
      }),
  );

  if (!canWrite) return server;

  // ── Write (editor and admin only) ─────────────────────────────────────────

  server.registerTool(
    'create_page',
    {
      title: 'Create page',
      description:
        'Create a page. Give `content` (full Markdown with frontmatter) or `template` (a document type) to start from the template.',
      inputSchema: INPUT.create_page,
    },
    async ({ space, ...input }) =>
      guard(async () => {
        const result = await createPage(DB, actor, space, input);
        return saved('Created', result.page, result.violations);
      }),
  );

  server.registerTool(
    'update_page',
    {
      title: 'Update page',
      description:
        "Replace a page's Markdown (and optionally its title). baseRevision must be the revision from read_page.",
      inputSchema: INPUT.update_page,
      annotations: { idempotentHint: false },
    },
    async ({ page, ...input }) =>
      guard(async () => {
        const result = await updatePage(DB, actor, page, input);
        const extra = result.linksToOldTitle
          ? [
              `${result.linksToOldTitle} page(s) still link to the old title; update them or they stay broken.`,
            ]
          : [];
        return saved('Updated', result.page, result.violations, extra);
      }),
  );

  server.registerTool(
    'move_page',
    {
      title: 'Move page',
      description: "Change a page's parent and/or its position among siblings.",
      inputSchema: INPUT.move_page,
    },
    async ({ page, ...input }) =>
      guard(async () => {
        const moved = await movePage(DB, actor, page, input);
        const path = [...moved.ancestors.map((a) => a.title), moved.title].join(' / ');
        return text(`Moved ${moved.spaceKey}/${moved.shortId}: ${path}`);
      }),
  );

  server.registerTool(
    'delete_page',
    {
      title: 'Delete page',
      description:
        'Move a page and all its children to the trash. People can restore it within 30 days.',
      inputSchema: INPUT.delete_page,
      annotations: { destructiveHint: true },
    },
    async ({ page }) =>
      guard(async () => {
        const { pageCount } = await deletePage(DB, actor, page);
        return text(`Moved ${pageCount} page(s) to the trash.`);
      }),
  );

  return server;
}
