import { OpenAPIHono } from '@hono/zod-openapi';
import { createMcpHandler } from 'agents/mcp/server';
import { HTTPException } from 'hono/http-exception';
import { files } from './api/files';
import { buildApi } from './api/index';
import { OPENAPI_JSON } from './api/openapi.gen';
import { problem } from './api/problem';
import { rateLimit } from './api/rate-limit';
import { authenticate, requireRole } from './auth/middleware';
import { buildMcpServer } from './mcp/server';
import type { Actor } from './services/actors';
import { ServiceError } from './services/errors';

export type AppEnv = { Bindings: Env; Variables: { actor: Actor } };

/** Reachable without a Clavis identity (Access still guards the whole Worker at the edge). */
const PUBLIC_PATHS = new Set(['/api/v1/health', '/api/v1/openapi.json', '/api/v1/docs']);

export function createApp() {
  const api = buildApi();
  // Generated at build time (pnpm --filter @clavis/worker openapi): building the document
  // from the zod schemas cost 30-115ms of CPU per request, over the free plan's 10ms (H2).
  api.get('/openapi.json', (c) =>
    c.body(OPENAPI_JSON, 200, { 'content-type': 'application/json; charset=utf-8' }),
  );

  const auth = authenticate();
  const app = new OpenAPIHono<AppEnv>();
  app.use('/api/*', (c, next) => (PUBLIC_PATHS.has(c.req.path) ? next() : auth(c, next)));
  app.use('/mcp', auth);
  app.use('/files/*', auth);
  // After authentication, so each actor (e.g. each agent token) has its own budget.
  app.use('/api/*', rateLimit());
  app.use('/mcp', rateLimit());
  app.use('/files/*', rateLimit());
  app.route('/api/v1', api);
  app.route('/', files);
  // One MCP handler per hostname for the isolate's lifetime; each request still gets its own
  // McpServer (stateless transport). The factory finds the request's actor by the Request.
  const mcpRequests = new WeakMap<Request, { env: Env; actor: Actor; origin: string }>();
  const mcpHandlers = new Map<string, ReturnType<typeof createMcpHandler>>();
  app.all('/mcp', requireRole('viewer'), (c) => {
    const url = new URL(c.req.url);
    let handler = mcpHandlers.get(url.hostname);
    if (!handler) {
      handler = createMcpHandler(
        ({ requestInfo }) => {
          const ctx = requestInfo && mcpRequests.get(requestInfo);
          if (!ctx) throw new Error('MCP request without an authenticated actor');
          return buildMcpServer(ctx.env, ctx.actor, ctx.origin);
        },
        {
          route: '/mcp',
          // Cloudflare only routes this Worker's own hostnames here, and Access has already
          // admitted the request, so the request's own host is the one to allow.
          allowedHostnames: [url.hostname],
        },
      );
      mcpHandlers.set(url.hostname, handler);
    }
    mcpRequests.set(c.req.raw, { env: c.env, actor: c.get('actor'), origin: url.origin });
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
