import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { emitFor } from '../events';
import { listTrash, restoreBatch } from '../services/trash';
import { problemResponse } from './problem';
import { router } from './router';
import { json, TrashEntry } from './schemas';

export const trash = router();
const tags = ['trash'];
const security = [{ bearer: [] }];

trash.openapi(
  createRoute({
    method: 'get',
    path: '/trash',
    tags,
    security,
    summary: 'Deleted page subtrees, newest first (kept 30 days)',
    middleware: [requireRole('viewer')],
    request: { query: z.object({ space: z.string().optional() }) },
    responses: { 200: json(z.object({ entries: z.array(TrashEntry) }), 'Trash entries') },
  }),
  async (c) => c.json({ entries: await listTrash(c.env.DB, c.req.valid('query').space) }, 200),
);

trash.openapi(
  createRoute({
    method: 'post',
    path: '/trash/{batchId}/restore',
    tags,
    security,
    summary: 'Restore a deleted subtree',
    middleware: [requireRole('editor')],
    request: {
      params: z.object({ batchId: z.string().openapi({ param: { name: 'batchId', in: 'path' } }) }),
    },
    responses: {
      200: json(
        z.object({
          restored: z.number(),
          renamed: z.array(z.object({ id: z.string(), title: z.string() })),
        }),
        'Restored; `renamed` lists pages whose title was taken meanwhile',
      ),
      404: problemResponse('Not found'),
    },
  }),
  async (c) =>
    c.json(
      await restoreBatch(c.env.DB, c.get('actor'), c.req.valid('param').batchId, {
        emit: emitFor(c),
      }),
      200,
    ),
);
