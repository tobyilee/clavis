import { createRoute, z } from '@hono/zod-openapi';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { requireRole } from '../auth/middleware';
import { db } from '../db/client';
import { actors, apiTokens } from '../db/schema';
import { createAgent, issueToken, renameActor } from '../services/actors';
import { indexStatus, queueStalePages } from '../services/semantic';
import { putSetting, SITE_TITLE } from '../services/settings';
import { ActorName, ActorSchema } from './me';
import { problem, problemResponse } from './problem';
import { router } from './router';
import { json } from './schemas';
import { SiteSchema, SiteTitleInput } from './site';

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
    summary: 'Approve, change role, disable, or rename an actor (only agents are renamed)',
    security: [{ bearer: [] }],
    request: {
      params: IdParam,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              role: z.enum(['admin', 'editor', 'viewer', 'pending']).optional(),
              disabled: z.boolean().optional(),
              /** Agents only: people choose their own (PATCH /me). Past edits show the new name. */
              name: ActorName.optional(),
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
      409: problemResponse('Another person or agent has this name'),
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
    if (body.name !== undefined && target.kind !== 'agent') {
      return problem(c, 400, 'invalid-name', 'Only agents can be renamed');
    }
    // The name first: when it is taken, nothing else changes either.
    if (body.name !== undefined && (await renameActor(d, id, body.name)) === null) {
      return problem(c, 409, 'name-taken', 'Another person or agent already has this name');
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
              name: ActorName,
              role: z.enum(['editor', 'viewer']).default('editor'),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: ActorSchema } } },
      409: problemResponse('Another person or agent has this name'),
    },
  }),
  async (c) => {
    const { name, role } = c.req.valid('json');
    const agent = await createAgent(db(c.env.DB), name, role, Date.now());
    if (!agent) {
      return problem(c, 409, 'name-taken', 'Another person or agent already has this name');
    }
    return c.json({ id: agent.id, kind: agent.kind, name: agent.name, email: null, role }, 201);
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

const SearchIndexSchema = z
  .object({
    available: z.boolean().openapi({ description: 'Workers AI and Vectorize are bound' }),
    pages: z.number().int().openapi({ description: 'Pages in active spaces' }),
    indexed: z.number().int().openapi({ description: 'Pages indexed at their current revision' }),
    vectors: z.number().int(),
    vectorLimit: z.number().int().openapi({ description: 'Vectors the free plan stores' }),
  })
  .openapi('SearchIndexStatus');

admin.openapi(
  createRoute({
    method: 'get',
    path: '/admin/search-index',
    tags: ['admin'],
    summary: 'Semantic search index: pages indexed and vectors used',
    security: [{ bearer: [] }],
    responses: { 200: json(SearchIndexSchema, 'Index status') },
  }),
  async (c) => c.json(await indexStatus(c.env), 200),
);

admin.openapi(
  createRoute({
    method: 'post',
    path: '/admin/search-index',
    tags: ['admin'],
    summary: 'Index every page not indexed at its current revision (through the queue)',
    security: [{ bearer: [] }],
    responses: {
      202: json(z.object({ queued: z.number().int() }), 'Pages queued; poll the status'),
    },
  }),
  async (c) => c.json({ queued: await queueStalePages(c.env) }, 202),
);

admin.openapi(
  createRoute({
    method: 'put',
    path: '/admin/site',
    tags: ['admin'],
    summary: 'Set the site title shown as "Clavis - {title}"; an empty title clears it',
    security: [{ bearer: [] }],
    request: {
      body: {
        content: { 'application/json': { schema: z.object({ title: SiteTitleInput }) } },
      },
    },
    responses: { 200: json(SiteSchema, 'Saved') },
  }),
  async (c) => {
    const { title } = c.req.valid('json');
    const saved = await putSetting(db(c.env.DB), SITE_TITLE, title, c.get('actor').id, Date.now());
    return c.json({ title: saved }, 200);
  },
);
