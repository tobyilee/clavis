import {
  RestoreRevisionSchema,
  RevisionListSchema,
  RevisionReadSchema,
} from '@clavis/shared/schema';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { emitFor } from '../events';
import { listRevisions, readRevision, restoreRevision } from '../services/revisions';
import { problemResponse } from './problem';
import { router } from './router';
import { json, PageRefParam, SaveResult } from './schemas';

/** Version history (D-54 ~ D-56). */
export const revisions = router();
const tags = ['revisions'];
const security = [{ bearer: [] }];

const RevisionList = RevisionListSchema.openapi('RevisionList');
const RevisionRead = RevisionReadSchema.openapi('RevisionRead');
const RevisionParam = PageRefParam.extend({
  revision: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: 'revision', in: 'path' }, example: 3 }),
});

revisions.openapi(
  createRoute({
    method: 'get',
    path: '/pages/{ref}/revisions',
    tags,
    security,
    summary: "A page's saved versions, newest first",
    description:
      'History began with Phase 3: a page saved before then shows its text from that time as a `baseline` revision, and nothing older (`historyStart`).',
    middleware: [requireRole('viewer')],
    request: {
      params: PageRefParam,
      query: z.object({
        before: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
    },
    responses: { 200: json(RevisionList, 'Revisions'), 404: problemResponse('Not found') },
  }),
  async (c) =>
    c.json(await listRevisions(c.env.DB, c.req.valid('param').ref, c.req.valid('query')), 200),
);

revisions.openapi(
  createRoute({
    method: 'get',
    path: '/pages/{ref}/revisions/{revision}',
    tags,
    security,
    summary: 'One revision with its text',
    middleware: [requireRole('viewer')],
    request: { params: RevisionParam },
    responses: {
      200: json(RevisionRead, 'The revision'),
      404: problemResponse('Page or revision not found, or its text was not kept'),
    },
  }),
  async (c) => {
    const { ref, revision } = c.req.valid('param');
    const { pageId: _pageId, ...read } = await readRevision(c.env, ref, revision);
    return c.json(read, 200);
  },
);

revisions.openapi(
  createRoute({
    method: 'post',
    path: '/pages/{ref}/revisions/{revision}/restore',
    tags,
    security,
    summary: "Save an old revision's text as a new revision (D-56)",
    description:
      'The title stays. The text goes through the normal save (lint, links); with `baseRevision` the restore fails if the page changed since.',
    middleware: [requireRole('editor')],
    request: {
      params: RevisionParam,
      body: { content: { 'application/json': { schema: RestoreRevisionSchema } }, required: false },
    },
    responses: {
      200: json(SaveResult, 'Restored as a new revision'),
      400: problemResponse('That revision is the current one'),
      404: problemResponse('Page or revision not found, or its text was not kept'),
      409: problemResponse('Page changed since `baseRevision`, or space archived'),
      422: problemResponse('The old text fails a lint rule that is an error now'),
    },
  }),
  async (c) => {
    const { ref, revision } = c.req.valid('param');
    const body = c.req.valid('json') ?? {};
    return c.json(
      await restoreRevision(c.env, c.get('actor'), ref, revision, body.baseRevision, {
        emit: emitFor(c),
      }),
      200,
    );
  },
);
