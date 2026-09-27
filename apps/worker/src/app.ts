import { OpenAPIHono } from '@hono/zod-openapi';
import { createMcpHandler } from 'agents/mcp/server';
import { HTTPException } from 'hono/http-exception';
import { admin } from './api/admin';
import { authoring } from './api/authoring';
import { docs } from './api/docs';
import { health } from './api/health';
import { me } from './api/me';
import { pages } from './api/pages';
import { problem } from './api/problem';
import { rateLimit } from './api/rate-limit';
import { router } from './api/router';
import { search } from './api/search';
import { spaces } from './api/spaces';
import { trash } from './api/trash';
import { authenticate, requireRole } from './auth/middleware';
import { buildMcpServer } from './mcp/server';
import type { Actor } from './services/actors';
import { ServiceError } from './services/errors';

export type AppEnv = { Bindings: Env; Variables: { actor: Actor } };

/** Reachable without a Clavis identity (Access still guards the whole Worker at the edge). */
const PUBLIC_PATHS = new Set(['/api/v1/health', '/api/v1/openapi.json', '/api/v1/docs']);

export function createApp() {
  const api = router();
  api.openAPIRegistry.registerComponent('securitySchemes', 'bearer', {
    type: 'http',
    scheme: 'bearer',
    description: 'Agent API token (clv_…). People are identified by Cloudflare Access instead.',
  });
  api.route('/', health);
  api.route('/', me);
  api.route('/', admin);
  api.route('/', spaces);
  api.route('/', pages);
  api.route('/', trash);
  api.route('/', search);
  api.route('/', authoring);
  api.route('/', docs);
  api.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Clavis API', version: 'v1' },
  });

  const auth = authenticate();
  const app = new OpenAPIHono<AppEnv>();
  app.use('/api/*', (c, next) => (PUBLIC_PATHS.has(c.req.path) ? next() : auth(c, next)));
  app.use('/mcp', auth);
  // After authentication, so each actor (e.g. each agent token) has its own budget.
  app.use('/api/*', rateLimit());
  app.use('/mcp', rateLimit());
  app.route('/api/v1', api);
  app.all('/mcp', requireRole('viewer'), (c) => {
    const actor = c.get('actor');
    const handler = createMcpHandler(() => buildMcpServer(c.env, actor), {
      route: '/mcp',
      // Cloudflare only routes this Worker's own hostnames here, and Access has already
      // admitted the request, so the request's own host is the one to allow.
      allowedHostnames: [new URL(c.req.url).hostname],
    });
    return handler(c.req.raw, c.env, c.executionCtx as unknown as ExecutionContext);
  });

  // Registered on the root app: Hono ignores notFound on mounted sub-apps. Only
  // run_worker_first paths (/api, /mcp, /files) reach the Worker, so every miss is an API miss.
  app.notFound((c) => problem(c, 404, 'not-found', 'Resource not found'));
  app.onError((err, c) => {
    if (err instanceof ServiceError) return problem(c, err.status, err.slug, err.title, err.extra);
    if (err instanceof HTTPException) return problem(c, err.status, 'http-error', err.message);
    console.error(err);
    return problem(c, 500, 'internal', 'Internal server error');
  });
  return app;
}
