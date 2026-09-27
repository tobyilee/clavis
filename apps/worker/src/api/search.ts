import { DOC_STATUSES, DOC_TYPES } from '@clavis/shared/schema';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { searchPages } from '../services/search';
import { router } from './router';
import { json, SearchHit } from './schemas';

export const search = router();

search.openapi(
  createRoute({
    method: 'get',
    path: '/search',
    tags: ['search'],
    security: [{ bearer: [] }],
    summary: 'Full-text search over titles and content',
    description:
      'Terms are ANDed. Terms of 3+ characters use the trigram index; a shorter term switches to substring matching. Snippets mark hits with U+E000 … U+E001.',
    middleware: [requireRole('viewer')],
    request: {
      query: z.object({
        q: z.string().min(1).max(200),
        space: z.string().optional(),
        type: z.enum(DOC_TYPES).optional(),
        status: z.enum(DOC_STATUSES).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        cursor: z.string().optional().openapi({ description: '`nextCursor` from the last page' }),
      }),
    },
    responses: {
      200: json(
        z.object({ hits: z.array(SearchHit), nextCursor: z.string().nullable() }),
        'Results, best first',
      ),
    },
  }),
  async (c) => {
    const { cursor, ...query } = c.req.valid('query');
    const offset = cursor ? Number.parseInt(cursor, 36) || 0 : 0;
    const { hits, more } = await searchPages(c.env.DB, { ...query, offset });
    return c.json({ hits, nextCursor: more ? (offset + hits.length).toString(36) : null }, 200);
  },
);
