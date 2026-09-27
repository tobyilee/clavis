import { createRoute } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { recheckSpace, spaceHealth } from '../services/quality';
import { problemResponse } from './problem';
import { router } from './router';
import { json, RecheckResult, SpaceHealth, SpaceKeyParam } from './schemas';

export const quality = router();
const tags = ['quality'];
const security = [{ bearer: [] }];

quality.openapi(
  createRoute({
    method: 'get',
    path: '/spaces/{key}/health',
    tags,
    security,
    summary: 'Space dashboard: lint findings per page and rule, and broken wiki links',
    description:
      'Lint results are stored at save time (D-46); `stalePages` were never checked or were checked under an older rule config — call `POST /spaces/{key}/lint/recheck` until it reports 0 remaining. Broken links are current.',
    middleware: [requireRole('viewer')],
    request: { params: SpaceKeyParam },
    responses: { 200: json(SpaceHealth, 'The dashboard'), 404: problemResponse('Not found') },
  }),
  async (c) => c.json(await spaceHealth(c.env.DB, c.req.valid('param').key), 200),
);

quality.openapi(
  createRoute({
    method: 'post',
    path: '/spaces/{key}/lint/recheck',
    tags,
    security,
    summary: 'Lint the next chunk of stale pages (about 100KB of content per call)',
    description: 'Repeat until `remaining` is 0. Only derived data is written.',
    middleware: [requireRole('viewer')],
    request: { params: SpaceKeyParam },
    responses: { 200: json(RecheckResult, 'Progress'), 404: problemResponse('Not found') },
  }),
  async (c) => c.json(await recheckSpace(c.env.DB, c.req.valid('param').key), 200),
);
