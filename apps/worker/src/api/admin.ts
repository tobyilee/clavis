import { createRoute, z } from '@hono/zod-openapi';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { requireRole } from '../auth/middleware';
import { db } from '../db/client';
import { actors, apiTokens } from '../db/schema';
import { createAgent, issueToken } from '../services/actors';
import { ActorSchema } from './me';
import { problem, problemResponse } from './problem';
import { router } from './router';

const IdParam = z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) });

const AdminActorSchema = ActorSchema.extend({
  createdAt: z.number(),
  disabledAt: z.number().nullable(),
}).openapi('AdminActor');

const TokenSchema = z
  .object({
    id: z.string(),
    actorId: z.string(),
    prefix: z.string(),
    lastUsedAt: z.number().nullable(),
    createdAt: z.number(),
    revokedAt: z.number().nullable(),
  })
  .openapi('ApiToken');

const toAdminActor = (a: typeof actors.$inferSelect) => ({
  id: a.id,
  kind: a.kind,
  name: a.name,
  email: a.email,
  role: a.role,
  createdAt: a.createdAt,
  disabledAt: a.disabledAt,
});

export const admin = router();
// Scoped to /admin/*: this router is mounted at the API root, so '*' would match every route.
admin.use('/admin/*', requireRole('admin'));

admin.openapi(
  createRoute({
    method: 'get',
    path: '/admin/actors',
    tags: ['admin'],
    summary: 'List people and agents',
    security: [{ bearer: [] }],
    responses: {
      200: {
        description: 'Actors, pending approvals first',
        content: {
          'application/json': { schema: z.object({ actors: z.array(AdminActorSchema) }) },
        },
      },
    },
  }),
  async (c) => {
    const rows = await db(c.env.DB).select().from(actors).orderBy(desc(actors.createdAt));
    rows.sort((a, b) => Number(b.role === 'pending') - Number(a.role === 'pending'));
    return c.json({ actors: rows.map(toAdminActor) }, 200);
  },
);

admin.openapi(
  createRoute({
    method: 'patch',
    path: '/admin/actors/{id}',
    tags: ['admin'],
    summary: 'Approve, change role, or disable an actor',
    security: [{ bearer: [] }],
    request: {
      params: IdParam,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              role: z.enum(['admin', 'editor', 'viewer', 'pending']).optional(),
              disabled: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated',
        content: { 'application/json': { schema: AdminActorSchema } },
      },
      400: problemResponse('Invalid change'),
      404: problemResponse('Actor not found'),
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    if (id === c.get('actor').id) {
      return problem(c, 400, 'self-change', 'Admins cannot change their own role or status');
    }
    const d = db(c.env.DB);
    const target = await d.query.actors.findFirst({ where: eq(actors.id, id) });
    if (!target) return problem(c, 404, 'not-found', 'Actor not found');
    if (target.kind === 'agent' && (body.role === 'admin' || body.role === 'pending')) {
      return problem(c, 400, 'invalid-role', 'Agents can only be editor or viewer');
    }
    const patch: Partial<typeof actors.$inferInsert> = {};
    if (body.role) patch.role = body.role;
    if (body.disabled !== undefined) patch.disabledAt = body.disabled ? Date.now() : null;
    if (Object.keys(patch).length > 0) await d.update(actors).set(patch).where(eq(actors.id, id));
    const updated = await d.query.actors.findFirst({ where: eq(actors.id, id) });
    return c.json(toAdminActor(updated ?? target), 200);
  },
);

admin.openapi(
  createRoute({
    method: 'post',
    path: '/admin/agents',
    tags: ['admin'],
    summary: 'Register an AI agent',
    security: [{ bearer: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: z.string().trim().min(1).max(64),
              role: z.enum(['editor', 'viewer']).default('editor'),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: ActorSchema } } },
    },
  }),
  async (c) => {
    const { name, role } = c.req.valid('json');
    const agent = await createAgent(db(c.env.DB), name, role, Date.now());
    return c.json({ id: agent.id, kind: agent.kind, name, email: null, role }, 201);
  },
);

admin.openapi(
  createRoute({
    method: 'post',
    path: '/admin/agents/{id}/tokens',
    tags: ['admin'],
    summary: 'Issue an API token for an agent (shown once)',
    security: [{ bearer: [] }],
    request: { params: IdParam },
    responses: {
      201: {
        description: 'The plaintext token. It cannot be retrieved again.',
        content: {
          'application/json': {
            schema: z.object({ id: z.string(), prefix: z.string(), token: z.string() }),
          },
        },
      },
      404: problemResponse('Agent not found'),
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const d = db(c.env.DB);
    const agent = await d.query.actors.findFirst({
      where: and(eq(actors.id, id), eq(actors.kind, 'agent')),
    });
    if (!agent) return problem(c, 404, 'not-found', 'Agent not found');
    return c.json(await issueToken(d, id, Date.now()), 201);
  },
);

admin.openapi(
  createRoute({
    method: 'get',
    path: '/admin/tokens',
    tags: ['admin'],
    summary: 'List API tokens (no secrets)',
    security: [{ bearer: [] }],
    responses: {
      200: {
        description: 'Tokens',
        content: { 'application/json': { schema: z.object({ tokens: z.array(TokenSchema) }) } },
      },
    },
  }),
  async (c) => {
    const rows = await db(c.env.DB)
      .select({
        id: apiTokens.id,
        actorId: apiTokens.actorId,
        prefix: apiTokens.prefix,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
        revokedAt: apiTokens.revokedAt,
      })
      .from(apiTokens)
      .orderBy(desc(apiTokens.createdAt));
    return c.json({ tokens: rows }, 200);
  },
);

admin.openapi(
  createRoute({
    method: 'delete',
    path: '/admin/tokens/{id}',
    tags: ['admin'],
    summary: 'Revoke an API token',
    security: [{ bearer: [] }],
    request: { params: IdParam },
    responses: { 204: { description: 'Revoked' }, 404: problemResponse('Token not found') },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const res = await db(c.env.DB)
      .update(apiTokens)
      .set({ revokedAt: Date.now() })
      .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
      .run();
    if (res.meta.changes === 0) return problem(c, 404, 'not-found', 'Active token not found');
    return c.body(null, 204);
  },
);
