import { createRoute, z } from '@hono/zod-openapi';
import { db } from '../db/client';
import { renameActor } from '../services/actors';
import { problem, problemResponse } from './problem';
import { router } from './router';
import { json } from './schemas';

export const ActorSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['human', 'agent']),
    name: z.string(),
    email: z.string().nullable(),
    role: z.enum(['admin', 'editor', 'viewer', 'pending']),
  })
  .openapi('Actor');

/**
 * A display name (D-66, D-68). It must fit the @mention markup `@[name](actor:id)`: at most 64
 * characters, no brackets or line breaks. Unique ignoring case, which the service checks.
 */
export const ActorName = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[^[\]\p{Cc}]+$/u, 'Brackets, line breaks and control characters are not allowed')
  .openapi({ example: 'Adam' });

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

const rename = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['auth'],
  summary: 'Change my display name (people only; an admin renames agents)',
  security: [{ bearer: [] }],
  request: {
    body: { content: { 'application/json': { schema: z.object({ name: ActorName }) } } },
  },
  responses: {
    200: json(ActorSchema, 'Updated; past records show the new name too'),
    403: problemResponse('Agents cannot rename themselves'),
    409: problemResponse('Another person or agent has this name'),
  },
});

export const me = router()
  .openapi(route, (c) => {
    const { id, kind, name, email, role } = c.get('actor');
    return c.json({ id, kind, name, email, role }, 200);
  })
  // No role check: people awaiting approval may set their name, so the admin sees who they are.
  .openapi(rename, async (c) => {
    const { id, kind, email, role } = c.get('actor');
    if (kind === 'agent') {
      return problem(c, 403, 'agent-rename', 'Agents are renamed by an admin');
    }
    const name = await renameActor(db(c.env.DB), id, c.req.valid('json').name);
    if (name === null) {
      return problem(c, 409, 'name-taken', 'Another person or agent already has this name');
    }
    return c.json({ id, kind, name, email, role }, 200);
  });
