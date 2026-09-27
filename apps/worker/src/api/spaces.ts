import { CreateSpaceSchema, UpdateSpaceSchema } from '@clavis/shared/schema';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { getTree } from '../services/pages';
import { createSpace, getSpace, listSpaces, updateSpace } from '../services/spaces';
import { problemResponse } from './problem';
import { router } from './router';
import { json, Space, SpaceKeyParam, TreeNode } from './schemas';

export const spaces = router();
const tags = ['spaces'];
const security = [{ bearer: [] }];

spaces.openapi(
  createRoute({
    method: 'get',
    path: '/spaces',
    tags,
    security,
    summary: 'List spaces',
    middleware: [requireRole('viewer')],
    request: {
      query: z.object({
        includeArchived: z
          .enum(['true', 'false'])
          .optional()
          .openapi({ description: 'Include archived spaces (D-34)' }),
      }),
    },
    responses: { 200: json(z.object({ spaces: z.array(Space) }), 'Spaces, by key') },
  }),
  async (c) => {
    const { includeArchived } = c.req.valid('query');
    return c.json({ spaces: await listSpaces(c.env.DB, includeArchived === 'true') }, 200);
  },
);

spaces.openapi(
  createRoute({
    method: 'post',
    path: '/spaces',
    tags,
    security,
    summary: 'Create a space and its home page (admin)',
    middleware: [requireRole('admin')],
    request: { body: { content: { 'application/json': { schema: CreateSpaceSchema } } } },
    responses: {
      201: json(Space, 'Created'),
      409: problemResponse('Key already used'),
    },
  }),
  async (c) => c.json(await createSpace(c.env.DB, c.get('actor'), c.req.valid('json')), 201),
);

spaces.openapi(
  createRoute({
    method: 'get',
    path: '/spaces/{key}',
    tags,
    security,
    summary: 'Get a space',
    middleware: [requireRole('viewer')],
    request: { params: SpaceKeyParam },
    responses: { 200: json(Space, 'The space'), 404: problemResponse('Not found') },
  }),
  async (c) => c.json(await getSpace(c.env.DB, c.req.valid('param').key), 200),
);

spaces.openapi(
  createRoute({
    method: 'patch',
    path: '/spaces/{key}',
    tags,
    security,
    summary: 'Rename, describe, set the home page, or unarchive a space (admin)',
    middleware: [requireRole('admin')],
    request: {
      params: SpaceKeyParam,
      body: {
        content: {
          'application/json': {
            schema: UpdateSpaceSchema.extend({ archived: z.boolean().optional() }),
          },
        },
      },
    },
    responses: { 200: json(Space, 'Updated'), 404: problemResponse('Not found') },
  }),
  async (c) =>
    c.json(await updateSpace(c.env.DB, c.req.valid('param').key, c.req.valid('json')), 200),
);

spaces.openapi(
  createRoute({
    method: 'delete',
    path: '/spaces/{key}',
    tags,
    security,
    summary: 'Archive a space: hidden and read-only, not deleted (admin, D-34)',
    middleware: [requireRole('admin')],
    request: { params: SpaceKeyParam },
    responses: { 200: json(Space, 'Archived'), 404: problemResponse('Not found') },
  }),
  async (c) =>
    c.json(await updateSpace(c.env.DB, c.req.valid('param').key, { archived: true }), 200),
);

spaces.openapi(
  createRoute({
    method: 'get',
    path: '/spaces/{key}/tree',
    tags,
    security,
    summary: 'The page tree of a space',
    description:
      'Send the previous ETag in If-None-Match; an unchanged tree answers 304 without reading pages.',
    middleware: [requireRole('viewer')],
    request: { params: SpaceKeyParam },
    responses: {
      200: json(z.object({ treeVersion: z.number(), tree: z.array(TreeNode) }), 'The tree'),
      304: { description: 'Not modified' },
      404: problemResponse('Not found'),
    },
  }),
  async (c) => {
    const { key } = c.req.valid('param');
    const etag = (version: number) => `W/"tree-${key.toUpperCase()}-${version}"`;
    const known = /^W\/"tree-([A-Z0-9]+)-(\d+)"$/.exec(c.req.header('if-none-match') ?? '');
    const knownVersion =
      known?.[1] === key.toUpperCase() && known[2] ? Number(known[2]) : undefined;
    const result = await getTree(c.env.DB, key, knownVersion);
    if (!result) {
      return c.body(null, 304, { etag: etag(knownVersion ?? 0) });
    }
    c.header('etag', etag(result.treeVersion));
    c.header('cache-control', 'private, no-cache');
    return c.json(result, 200);
  },
);
