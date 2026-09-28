import { DOC_STATUSES, DOC_TYPES } from '@clavis/shared/schema';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { searchInMode } from '../services/semantic';
import { router } from './router';
import { json, SearchHit } from './schemas';

export const search = router();

const MODES = ['text', 'semantic', 'hybrid'] as const;

search.openapi(
  createRoute({
    method: 'get',
    path: '/search',
    tags: ['search'],
    security: [{ bearer: [] }],
    summary: 'Search titles and content, by words or by meaning',
    description:
      'text (default): terms are ANDed; terms of 3+ characters use the trigram index, a shorter term switches to substring matching. Snippets mark hits with U+E000 … U+E001. semantic: pages whose sections are closest in meaning, each with its best section. hybrid: both, merged by rank. semantic and hybrid return one page of results and fall back to text when unavailable (see `mode` in the response).',
    middleware: [requireRole('viewer')],
    request: {
      query: z.object({
        q: z.string().min(1).max(200),
        mode: z.enum(MODES).default('text'),
        space: z.string().optional(),
        type: z.enum(DOC_TYPES).optional(),
        status: z.enum(DOC_STATUSES).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        cursor: z.string().optional().openapi({ description: '`nextCursor` from the last page' }),
      }),
    },
    responses: {
      200: json(
        z.object({
          hits: z.array(SearchHit),
          nextCursor: z.string().nullable(),
          mode: z.enum(MODES).openapi({ description: 'The mode that ran' }),
        }),
        'Results, best first',
      ),
    },
  }),
  async (c) => {
    const { cursor, mode, ...query } = c.req.valid('query');
    const offset = cursor ? Number.parseInt(cursor, 36) || 0 : 0;
    const r = await searchInMode(c.env, { ...query, offset }, mode);
    const nextCursor = r.more ? (offset + r.hits.length).toString(36) : null;
    return c.json({ hits: r.hits, nextCursor, mode: r.mode }, 200);
  },
);
