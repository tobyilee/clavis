import { createRoute, z } from '@hono/zod-openapi';
import { router } from './router';

export const ActorSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['human', 'agent']),
    name: z.string(),
    email: z.string().nullable(),
    role: z.enum(['admin', 'editor', 'viewer', 'pending']),
  })
  .openapi('Actor');

const route = createRoute({
  method: 'get',
  path: '/me',
  tags: ['auth'],
  summary: 'The authenticated actor (person or agent)',
  security: [{ bearer: [] }],
  responses: {
    200: { description: 'Current actor', content: { 'application/json': { schema: ActorSchema } } },
  },
});

export const me = router().openapi(route, (c) => {
  const { id, kind, name, email, role } = c.get('actor');
  return c.json({ id, kind, name, email, role }, 200);
});
