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
import { addComment, listThreads, openThreadCount, setResolved } from '../services/comments';
import { ServiceError } from '../services/errors';
import { lintContent } from '../services/links';
import {
  createPage,
  deletePage,
  getBacklinks,
  getPage,
  getTreeNodes,
  movePage,
  updatePage,
} from '../services/pages';
import { spaceHealth } from '../services/quality';
import { searchPages } from '../services/search';
import { listSections, patchPageMeta, readSection, updateSection } from '../services/sections';
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
- For a change to one part of a page, prefer sections: list_sections, read_section, then
  update_section. Others may edit other sections meanwhile without a conflict. To add a
  list item or a note (meeting action items, logs), update_section with mode "append".
- To change only status, owner or tags, use set_page_meta.

Comments
- read_page shows open_comments=N. list_comments shows review threads from people and
  agents. When you address one in the page, reply with add_comment (replyTo) saying what
  you changed, then resolve_comment. Ask questions with add_comment instead of guessing.
- Link pages with [[Page title]] or [[SPACEKEY:Page title]]; attachments with
  ![alt](attachments/file.png).
- Warnings do not block a save, but fix them when you can; lint_markdown checks a draft.
- get_space_health lists pages with rule findings and broken [[links]] in a space;
  get_backlinks shows which pages link to a page (check before renaming or deleting).
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
    if (e.slug === 'section-conflict') {
      lines.push('Reapply your edit to the section text above, with the new hash.');
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
const sectionArg = z
  .string()
  .describe('Section id from list_sections (e.g. "액션-아이템") or the heading text');

/**
 * Wraps a zod schema so its JSON Schema is computed once per isolate. McpServer converts
 * every tool's schema eagerly in registerTool, and the server is new per request (stateless
 * transport), so without this each MCP call paid for nine conversions (H2: ~15ms CPU).
 * Validation still goes to zod.
 */
function cached<T extends z.ZodType>(schema: T): T {
  const std = schema['~standard'];
  const memo: Partial<Record<'input' | 'output', unknown>> = {};
  const jsonSchema = std.jsonSchema;
  if (!jsonSchema) return schema;
  const once = <R>(io: 'input' | 'output', compute: () => R): R => {
    if (!(io in memo)) memo[io] = compute();
    return memo[io] as R;
  };
  const wrapped = {
    ...std,
    validate: (value: unknown) => std.validate(value),
    jsonSchema: {
      input: (options: Parameters<typeof jsonSchema.input>[0]) =>
        once('input', () => jsonSchema.input(options)),
      output: (options: Parameters<typeof jsonSchema.output>[0]) =>
        once('output', () => jsonSchema.output(options)),
    },
  };
  return { '~standard': wrapped } as unknown as T;
}

/** Tool input schemas, built (and converted to JSON Schema) once per isolate. */
const INPUT = {
  get_space_tree: cached(z.object({ space: z.string().describe('Space key, e.g. "PAY"') })),
  read_page: cached(z.object({ page: pageArg })),
  get_backlinks: cached(z.object({ page: pageArg })),
  get_space_health: cached(z.object({ space: z.string().describe('Space key, e.g. "PAY"') })),
  search_pages: cached(
    z.object({
      query: z.string().min(1).max(200),
      space: z.string().optional().describe('Limit to a space key'),
      type: z.enum(DOC_TYPES).optional(),
      status: z.enum(DOC_STATUSES).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  ),
  list_templates: cached(z.object({ locale: z.enum(['ko', 'en']).optional() })),
  lint_markdown: cached(
    z.object({
      content: z.string().max(200_000),
      space: z.string().optional(),
      page: z.string().optional().describe('Short id of the page the content belongs to'),
    }),
  ),
  create_page: cached(
    z.object({
      space: z.string().describe('Space key, e.g. "PAY"'),
      title: PageTitleSchema,
      content: z.string().optional(),
      template: z.enum(DOC_TYPES).optional(),
      parent: z.string().optional().describe('Parent page short id; omit for top level'),
      after: z.string().optional().describe('Sibling short id to place the page after'),
    }),
  ),
  update_page: cached(
    z.object({
      page: pageArg,
      content: z.string().describe('Full Markdown including frontmatter'),
      baseRevision: z.number().int().positive(),
      title: PageTitleSchema.optional().describe(
        'New title; [[links]] to the old title in other pages are rewritten',
      ),
    }),
  ),
  move_page: cached(
    z.object({
      page: pageArg,
      parent: z
        .string()
        .nullable()
        .optional()
        .describe('New parent short id, null for top level; omit to keep the parent'),
      after: z.string().optional().describe('Sibling short id to place after'),
      before: z.string().optional().describe('Sibling short id to place before'),
    }),
  ),
  delete_page: cached(z.object({ page: pageArg })),
  list_sections: cached(z.object({ page: pageArg })),
  list_comments: cached(
    z.object({
      page: pageArg,
      includeResolved: z.boolean().optional().describe('Also list resolved threads'),
    }),
  ),
  add_comment: cached(
    z.object({
      page: pageArg,
      body: z.string().describe('Markdown'),
      replyTo: z.string().optional().describe('Comment id to reply to; omit for a new thread'),
      section: z
        .string()
        .optional()
        .describe('New threads: the section id (from list_sections) it is about'),
    }),
  ),
  resolve_comment: cached(
    z.object({
      comment: z.string().describe('Any comment id in the thread'),
      reopen: z.boolean().optional(),
    }),
  ),
  read_section: cached(z.object({ page: pageArg, section: sectionArg })),
  update_section: cached(
    z.object({
      page: pageArg,
      section: sectionArg,
      mode: z
        .enum(['replace', 'append'])
        .describe(
          'replace: new body for the section (start with the same-level heading to change it too). append: added after the section, e.g. a new list item',
        ),
      content: z.string().describe('Markdown to put in the section'),
      baseSectionHash: z
        .string()
        .optional()
        .describe('Required for replace: the hash from read_section or list_sections'),
    }),
  ),
  set_page_meta: cached(
    z.object({
      page: pageArg,
      status: z.enum(DOC_STATUSES).optional(),
      owner: z.string().optional(),
      tags: z.array(z.string()).optional().describe('Replaces the whole tag list'),
    }),
  ),
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
        const open = await openThreadCount(DB, found.id);
        const header = `<!-- clavis: ${found.spaceKey}/${found.shortId} "${found.title}" revision=${found.revision} updated_by=${found.updatedBy.name} open_comments=${open} -->`;
        return text(`${header}\n${found.content}`);
      }),
  );

  server.registerTool(
    'get_backlinks',
    {
      title: 'Get backlinks',
      description: 'List the pages (in any space) that link to a page with [[wiki links]].',
      inputSchema: INPUT.get_backlinks,
      annotations: { readOnlyHint: true },
    },
    async ({ page }) =>
      guard(async () => {
        const links = await getBacklinks(DB, page);
        if (links.length === 0) return text('No pages link here.');
        return text(links.map((b) => `- ${b.spaceKey}/${b.shortId} "${b.title}"`).join('\n'));
      }),
  );

  server.registerTool(
    'get_space_health',
    {
      title: 'Get space health',
      description:
        'Document quality in a space: pages with lint findings (rule, count, first line) and broken wiki links.',
      inputSchema: INPUT.get_space_health,
      annotations: { readOnlyHint: true },
    },
    async ({ space }) =>
      guard(async () => {
        const h = await spaceHealth(DB, space);
        const { errors, warnings, infos } = h.totals;
        const lines = [
          `Space ${h.space}: ${h.totalPages} pages; findings: ${errors} error, ${warnings} warning, ${infos} info.`,
        ];
        if (h.stalePages > 0) {
          lines.push(
            `${h.stalePages} page(s) not yet checked under the current rules, so this may be incomplete (the web dashboard rechecks them).`,
          );
        }
        if (h.pages.length > 0) {
          lines.push('', 'Pages with findings:');
          for (const p of h.pages) {
            const rules = p.rules
              .map((r) => `${r.severity} ${r.ruleId} x${r.count} (L${r.line})`)
              .join('; ');
            lines.push(`- ${h.space}/${p.shortId} "${p.title}": ${rules}`);
          }
        }
        if (h.brokenLinks.length > 0) {
          lines.push('', 'Broken wiki links (target page does not exist):');
          for (const p of h.brokenLinks) {
            const targets = p.targets
              .map((t) =>
                t.spaceKey === h.space ? `[[${t.title}]]` : `[[${t.spaceKey}:${t.title}]]`,
              )
              .join(', ');
            lines.push(`- ${h.space}/${p.shortId} "${p.title}": ${targets}`);
          }
        }
        if (h.pages.length === 0 && h.brokenLinks.length === 0) lines.push('No problems found.');
        return text(lines.join('\n'));
      }),
  );

  server.registerTool(
    'list_sections',
    {
      title: 'List sections',
      description:
        "A page's headings as sections: id, level, line range and hash. Read or edit one section instead of the whole page.",
      inputSchema: INPUT.list_sections,
      annotations: { readOnlyHint: true },
    },
    async ({ page }) =>
      guard(async () => {
        const { revision, sections } = await listSections(DB, page);
        if (sections.length === 0) return text(`revision=${revision}\nThe page has no headings.`);
        const lines = sections.map(
          (s) =>
            `${'  '.repeat(s.level - 1)}- ${'#'.repeat(s.level)} ${s.title}  id=${s.id} lines=${s.line}-${s.endLine} hash=${s.hash}`,
        );
        return text([`revision=${revision}`, ...lines].join('\n'));
      }),
  );

  server.registerTool(
    'read_section',
    {
      title: 'Read section',
      description:
        'Read one section (its heading and everything under it) with the hash needed to replace it.',
      inputSchema: INPUT.read_section,
      annotations: { readOnlyHint: true },
    },
    async ({ page, section }) =>
      guard(async () => {
        const r = await readSection(DB, page, section);
        const header = `<!-- clavis section: id=${r.section.id} lines=${r.section.line}-${r.section.endLine} hash=${r.section.hash} revision=${r.revision} -->`;
        return text(`${header}\n${r.content}`);
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

  server.registerTool(
    'list_comments',
    {
      title: 'List comments',
      description: 'Comment threads on a page (open ones unless includeResolved), with replies.',
      inputSchema: INPUT.list_comments,
      annotations: { readOnlyHint: true },
    },
    async ({ page, includeResolved }) =>
      guard(async () => {
        const threads = await listThreads(DB, page, includeResolved ? 'all' : 'open');
        if (threads.length === 0) return text('No open comments.');
        const who = (a: { name: string; kind: string }) =>
          `${a.name}${a.kind === 'agent' ? ' (agent)' : ''}`;
        const quote = (body: string) => body.replace(/\n/g, '\n    ');
        const lines = threads.map((t) => {
          const head = `- [${t.id}] ${who(t.author)}${t.sectionId ? ` on #${t.sectionId}` : ''}${t.resolvedAt ? ' (resolved)' : ''}: ${quote(t.body)}`;
          const replies = t.replies.map((r) => `  - [${r.id}] ${who(r.author)}: ${quote(r.body)}`);
          return [head, ...replies].join('\n');
        });
        return text(lines.join('\n'));
      }),
  );

  // Anyone who can read may comment (D-45).
  server.registerTool(
    'add_comment',
    {
      title: 'Add comment',
      description: 'Comment on a page, or reply in a thread with replyTo.',
      inputSchema: INPUT.add_comment,
    },
    async ({ page, body, replyTo, section }) =>
      guard(async () => {
        const c = await addComment(DB, actor, page, { body, replyTo, sectionId: section });
        return text(`Added comment ${c.id}${replyTo ? ` in thread ${c.threadId}` : ''}.`);
      }),
  );

  if (!canWrite) return server;

  server.registerTool(
    'resolve_comment',
    {
      title: 'Resolve comment thread',
      description: 'Mark a comment thread resolved (or reopen it).',
      inputSchema: INPUT.resolve_comment,
      annotations: { idempotentHint: true },
    },
    async ({ comment, reopen }) =>
      guard(async () => {
        const r = await setResolved(DB, actor, comment, !reopen);
        return text(`Thread ${r.threadId} ${reopen ? 'reopened' : 'resolved'}.`);
      }),
  );

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
        const extra: string[] = [];
        if (result.linksUpdated) {
          extra.push(`Rewrote [[links]] to the new title in ${result.linksUpdated} other page(s).`);
        }
        if (result.linksToOldTitle) {
          extra.push(
            `${result.linksToOldTitle} page(s) still link to the old title (too many to rewrite at once, or archived); update them or they stay broken.`,
          );
        }
        return saved('Updated', result.page, result.violations, extra);
      }),
  );

  server.registerTool(
    'update_section',
    {
      title: 'Update section',
      description:
        'Replace or append to one section of a page, then save the page. replace needs the baseSectionHash from read_section; append needs none.',
      inputSchema: INPUT.update_section,
      annotations: { idempotentHint: false },
    },
    async ({ page, section, ...input }) =>
      guard(async () => {
        const result = await updateSection(DB, actor, page, section, input);
        return saved(`Updated section "${section}" of`, result.page, result.violations);
      }),
  );

  server.registerTool(
    'set_page_meta',
    {
      title: 'Set page status, owner or tags',
      description: 'Change frontmatter fields without sending the page content.',
      inputSchema: INPUT.set_page_meta,
      annotations: { idempotentHint: true },
    },
    async ({ page, ...patch }) =>
      guard(async () => {
        const result = await patchPageMeta(DB, actor, page, patch);
        return saved('Updated', result.page, result.violations);
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
