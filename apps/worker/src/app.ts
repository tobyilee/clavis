import { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { health } from './api/health';
import { problem } from './api/problem';

export type AppEnv = { Bindings: Env };

export function createApp() {
  const api = new OpenAPIHono<AppEnv>({
    // Request validation failures become problem+json instead of Hono's default shape.
    defaultHook: (result, c) => {
      if (!result.success) {
        return problem(c, 400, 'invalid-request', 'Request validation failed', {
          detail: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        });
      }
    },
  });

  api.route('/', health);

  api.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Clavis API', version: 'v1' },
  });

  const app = new OpenAPIHono<AppEnv>();
  app.route('/api/v1', api);

  // Registered on the root app: Hono ignores notFound on mounted sub-apps. Only
  // run_worker_first paths (/api, /mcp, /files) reach the Worker, so every miss is an API miss.
  app.notFound((c) => problem(c, 404, 'not-found', 'Resource not found'));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return problem(c, err.status, 'http-error', err.message);
    console.error(err);
    return problem(c, 500, 'internal', 'Internal server error');
  });
  return app;
}
