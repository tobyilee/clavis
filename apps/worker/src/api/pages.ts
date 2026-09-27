import { CreatePageSchema, MovePageSchema, UpdatePageSchema } from '@clavis/shared/schema';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { recordView } from '../services/home';
import {
  createPage,
  deletePage,
  getBacklinks,
  getPage,
  movePage,
  updatePage,
} from '../services/pages';
import { problemResponse } from './problem';
import { router } from './router';
import { Backlink, json, Page, PageRefParam, SaveResult, SpaceKeyParam } from './schemas';

export const pages = router();
const tags = ['pages'];
const security = [{ bearer: [] }];

const saveErrors = {
  404: problemResponse('Page, space or parent not found'),
  409: problemResponse('Revision conflict (see `revision`), title taken, or space archived'),
  413: problemResponse('Content over 100KB (D-33)'),
  422: problemResponse('Lint errors (see `violations`); nothing was saved'),
};

pages.openapi(
  createRoute({
    method: 'post',
    path: '/spaces/{key}/pages',
    tags,
    security,
    summary: 'Create a page',
    description:
      'Omit `content` to start from `template` (a document type). The response carries the non-blocking lint findings.',
    middleware: [requireRole('editor')],
    request: {
      params: SpaceKeyParam,
      body: { content: { 'application/json': { schema: CreatePageSchema } } },
    },
    responses: { 201: json(SaveResult, 'Created'), 400: problemResponse('Invalid'), ...saveErrors },
  }),
  async (c) => {
    const result = await createPage(
      c.env.DB,
      c.get('actor'),
      c.req.valid('param').key,
      c.req.valid('json'),
    );
    return c.json(result, 201);
  },
);

// Registered before /pages/{ref} so "by-title" is not taken for a page reference.
pages.openapi(
  createRoute({
    method: 'get',
    path: '/pages/by-title',
    tags,
    security,
    summary: 'Find a page by space and exact title (resolves wiki links)',
    middleware: [requireRole('viewer')],
    request: { query: z.object({ space: z.string(), title: z.string() }) },
    responses: { 200: json(Page, 'The page'), 404: problemResponse('Not found') },
  }),
  async (c) => {
    const { space, title } = c.req.valid('query');
    return c.json(await getPage(c.env.DB, { spaceKey: space.toUpperCase(), title }), 200);
  },
);

pages.openapi(
  createRoute({
    method: 'get',
    path: '/pages/{ref}',
    tags,
    security,
    summary: 'Get a page',
    description:
      'With `Accept: text/markdown` the body is the raw Markdown (frontmatter included) and the revision is in the `X-Clavis-Revision` header.',
    middleware: [requireRole('viewer')],
    request: { params: PageRefParam },
    responses: {
      200: {
        description: 'The page',
        content: {
          'application/json': { schema: Page },
          'text/markdown': { schema: z.string() },
        },
      },
      404: problemResponse('Not found'),
    },
  }),
  async (c) => {
    const page = await getPage(c.env.DB, c.req.valid('param').ref);
    const actor = c.get('actor');
    // People's recently viewed list (D-50); after the response, so reading is not slowed.
    if (actor.kind === 'human') c.executionCtx.waitUntil(recordView(c.env.DB, actor.id, page.id));
    if (c.req.header('accept')?.includes('text/markdown')) {
      return c.body(page.content, 200, {
        'content-type': 'text/markdown; charset=utf-8',
        'x-clavis-revision': String(page.revision),
        'x-clavis-page': `${page.spaceKey}/${page.shortId}`,
      });
    }
    return c.json(page, 200);
  },
);

pages.openapi(
  createRoute({
    method: 'get',
    path: '/pages/{ref}/backlinks',
    tags,
    security,
    summary: 'Pages that link to this page, from any space',
    middleware: [requireRole('viewer')],
    request: { params: PageRefParam },
    responses: {
      200: json(z.object({ backlinks: z.array(Backlink) }), 'Linking pages, by space and title'),
      404: problemResponse('Not found'),
    },
  }),
  async (c) => c.json({ backlinks: await getBacklinks(c.env.DB, c.req.valid('param').ref) }, 200),
);

pages.openapi(
  createRoute({
    method: 'put',
    path: '/pages/{ref}',
    tags,
    security,
    summary: 'Update a page (title, content)',
    description:
      '`baseRevision` must equal the current revision (optimistic lock); otherwise 409 with the current `revision`.',
    middleware: [requireRole('editor')],
    request: {
      params: PageRefParam,
      body: { content: { 'application/json': { schema: UpdatePageSchema } } },
    },
    responses: { 200: json(SaveResult, 'Saved'), ...saveErrors },
  }),
  async (c) => {
    const result = await updatePage(
      c.env.DB,
      c.get('actor'),
      c.req.valid('param').ref,
      c.req.valid('json'),
    );
    return c.json(result, 200);
  },
);

pages.openapi(
  createRoute({
    method: 'post',
    path: '/pages/{ref}/move',
    tags,
    security,
    summary: 'Move a page (new parent and/or sibling position)',
    middleware: [requireRole('editor')],
    request: {
      params: PageRefParam,
      body: { content: { 'application/json': { schema: MovePageSchema } } },
    },
    responses: {
      200: json(Page, 'Moved'),
      400: problemResponse('Invalid move (e.g. under its own child)'),
      404: problemResponse('Not found'),
      409: problemResponse('Space archived'),
    },
  }),
  async (c) => {
    const page = await movePage(
      c.env.DB,
      c.get('actor'),
      c.req.valid('param').ref,
      c.req.valid('json'),
    );
    return c.json(page, 200);
  },
);

pages.openapi(
  createRoute({
    method: 'delete',
    path: '/pages/{ref}',
    tags,
    security,
    summary: 'Move a page and its children to the trash',
    middleware: [requireRole('editor')],
    request: { params: PageRefParam },
    responses: {
      200: json(z.object({ batchId: z.string(), pageCount: z.number() }), 'Trashed'),
      404: problemResponse('Not found'),
      409: problemResponse('Space home page, or space archived'),
    },
  }),
  async (c) => c.json(await deletePage(c.env.DB, c.get('actor'), c.req.valid('param').ref), 200),
);
