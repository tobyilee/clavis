import { createRoute, z } from '@hono/zod-openapi';
import { router } from './router';

const HealthSchema = z
  .object({
    status: z.literal('ok'),
    version: z.string(),
    db: z.enum(['ok', 'error']),
  })
  .openapi('Health');

const route = createRoute({
  method: 'get',
  path: '/health',
  tags: ['system'],
  summary: 'Service health check',
  responses: {
    200: {
      description: 'Service is up',
      content: { 'application/json': { schema: HealthSchema } },
    },
  },
});

export const health = router().openapi(route, async (c) => {
  let db: 'ok' | 'error' = 'ok';
  try {
    await c.env.DB.prepare('SELECT 1').first();
  } catch {
    db = 'error';
  }
  return c.json({ status: 'ok' as const, version: c.env.APP_VERSION, db }, 200);
});
