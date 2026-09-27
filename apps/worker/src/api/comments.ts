import {
  CommentSchema,
  CreateCommentSchema,
  ThreadSchema,
  UpdateCommentSchema,
} from '@clavis/shared/schema';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import {
  addComment,
  deleteComment,
  listThreads,
  setResolved,
  updateComment,
} from '../services/comments';
import { problemResponse } from './problem';
import { router } from './router';
import { json, PageRefParam } from './schemas';

export const comments = router();
const tags = ['comments'];
const security = [{ bearer: [] }];

const Thread = ThreadSchema.openapi('Thread');
const Comment = CommentSchema.extend({ threadId: z.string() }).openapi('Comment');
const IdParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' }, description: 'Comment id' }),
});
const Resolution = z.object({ threadId: z.string(), resolvedAt: z.number().nullable() });

comments.openapi(
  createRoute({
    method: 'get',
    path: '/pages/{ref}/comments',
    tags,
    security,
    summary: 'Comment threads on a page, oldest first',
    middleware: [requireRole('viewer')],
    request: {
      params: PageRefParam,
      query: z.object({ status: z.enum(['open', 'resolved', 'all']).optional() }),
    },
    responses: {
      200: json(z.object({ threads: z.array(Thread) }), 'Threads with replies'),
      404: problemResponse('Not found'),
    },
  }),
  async (c) => {
    const threads = await listThreads(
      c.env.DB,
      c.req.valid('param').ref,
      c.req.valid('query').status,
    );
    return c.json({ threads }, 200);
  },
);

comments.openapi(
  createRoute({
    method: 'post',
    path: '/pages/{ref}/comments',
    tags,
    security,
    summary: 'Comment on a page, or reply in a thread (any role that can read, D-45)',
    middleware: [requireRole('viewer')],
    request: {
      params: PageRefParam,
      body: { content: { 'application/json': { schema: CreateCommentSchema } } },
    },
    responses: {
      201: json(Comment, 'Created'),
      400: problemResponse('Invalid'),
      404: problemResponse('Page or comment not found'),
      409: problemResponse('Space archived'),
    },
  }),
  async (c) =>
    c.json(
      await addComment(c.env.DB, c.get('actor'), c.req.valid('param').ref, c.req.valid('json')),
      201,
    ),
);

comments.openapi(
  createRoute({
    method: 'patch',
    path: '/comments/{id}',
    tags,
    security,
    summary: 'Edit your comment',
    middleware: [requireRole('viewer')],
    request: {
      params: IdParam,
      body: { content: { 'application/json': { schema: UpdateCommentSchema } } },
    },
    responses: {
      204: { description: 'Updated' },
      403: problemResponse('Not the author'),
      404: problemResponse('Not found'),
    },
  }),
  async (c) => {
    await updateComment(
      c.env.DB,
      c.get('actor'),
      c.req.valid('param').id,
      c.req.valid('json').body,
    );
    return c.body(null, 204);
  },
);

comments.openapi(
  createRoute({
    method: 'delete',
    path: '/comments/{id}',
    tags,
    security,
    summary: 'Delete a comment (author or admin); a comment with replies cannot be deleted',
    middleware: [requireRole('viewer')],
    request: { params: IdParam },
    responses: {
      204: { description: 'Deleted' },
      403: problemResponse('Not the author'),
      404: problemResponse('Not found'),
      409: problemResponse('Has replies: resolve the thread instead'),
    },
  }),
  async (c) => {
    await deleteComment(c.env.DB, c.get('actor'), c.req.valid('param').id);
    return c.body(null, 204);
  },
);

for (const [action, resolved] of [
  ['resolve', true],
  ['reopen', false],
] as const) {
  comments.openapi(
    createRoute({
      method: 'post',
      path: `/comments/{id}/${action}`,
      tags,
      security,
      summary: `${resolved ? 'Resolve' : 'Reopen'} the thread of a comment (editor)`,
      middleware: [requireRole('editor')],
      request: { params: IdParam },
      responses: { 200: json(Resolution, 'Thread state'), 404: problemResponse('Not found') },
    }),
    async (c) =>
      c.json(await setResolved(c.env.DB, c.get('actor'), c.req.valid('param').id, resolved), 200),
  );
}
