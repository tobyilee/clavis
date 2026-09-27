import { Hono } from 'hono';
import type { AppEnv } from '../app';

/** Scalar API reference for /api/v1/openapi.json (plan B7). The page itself holds no data. */
export const docs = new Hono<AppEnv>().get('/docs', (c) =>
  c.html(`<!doctype html>
<html>
  <head>
    <title>Clavis API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/api/v1/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1"></script>
  </body>
</html>`),
);
