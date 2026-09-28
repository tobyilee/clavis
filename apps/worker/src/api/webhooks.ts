import { CreateWebhookSchema, UpdateWebhookSchema, WebhookSchema } from '@clavis/shared/schema';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  testWebhook,
  updateWebhook,
} from '../services/webhooks';
import { problemResponse } from './problem';
import { router } from './router';
import { json, SpaceKeyParam } from './schemas';

/** A space's Slack channels and webhooks (D-58, D-60). Admins only: the URLs are secrets. */
export const webhooks = router();
const tags = ['webhooks'];
const security = [{ bearer: [] }];

const Webhook = WebhookSchema.openapi('Webhook');
const IdParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' }, description: 'Webhook id' }),
});

webhooks.openapi(
  createRoute({
    method: 'get',
    path: '/spaces/{key}/webhooks',
    tags,
    security,
    summary: "A space's Slack channels and webhooks, with recent deliveries",
    middleware: [requireRole('admin')],
    request: { params: SpaceKeyParam },
    responses: {
      200: json(z.object({ webhooks: z.array(Webhook) }), 'Webhooks'),
      404: problemResponse('Space not found'),
    },
  }),
  async (c) => c.json({ webhooks: await listWebhooks(c.env.DB, c.req.valid('param').key) }, 200),
);

webhooks.openapi(
  createRoute({
    method: 'post',
    path: '/spaces/{key}/webhooks',
    tags,
    security,
    summary: 'Add a Slack Incoming Webhook or a JSON webhook',
    description:
      'JSON webhooks get the event as JSON with `X-Clavis-Event`, `X-Clavis-Delivery` and `X-Clavis-Signature: sha256=<HMAC-SHA256 of the body with the secret>`. Failed deliveries (5xx, 429, timeouts) are retried up to 3 times.',
    middleware: [requireRole('admin')],
    request: {
      params: SpaceKeyParam,
      body: { content: { 'application/json': { schema: CreateWebhookSchema } } },
    },
    responses: {
      201: json(Webhook, 'Created'),
      400: problemResponse('Invalid URL'),
      404: problemResponse('Space not found'),
    },
  }),
  async (c) =>
    c.json(
      await createWebhook(c.env.DB, c.get('actor'), c.req.valid('param').key, c.req.valid('json')),
      201,
    ),
);

webhooks.openapi(
  createRoute({
    method: 'patch',
    path: '/webhooks/{id}',
    tags,
    security,
    summary: 'Change a webhook URL, its events, or turn it off',
    middleware: [requireRole('admin')],
    request: {
      params: IdParam,
      body: { content: { 'application/json': { schema: UpdateWebhookSchema } } },
    },
    responses: { 200: json(Webhook, 'Updated'), 404: problemResponse('Not found') },
  }),
  async (c) =>
    c.json(await updateWebhook(c.env.DB, c.req.valid('param').id, c.req.valid('json')), 200),
);

webhooks.openapi(
  createRoute({
    method: 'delete',
    path: '/webhooks/{id}',
    tags,
    security,
    summary: 'Remove a webhook',
    middleware: [requireRole('admin')],
    request: { params: IdParam },
    responses: { 204: { description: 'Deleted' }, 404: problemResponse('Not found') },
  }),
  async (c) => {
    await deleteWebhook(c.env.DB, c.req.valid('param').id);
    return c.body(null, 204);
  },
);

webhooks.openapi(
  createRoute({
    method: 'post',
    path: '/webhooks/{id}/test',
    tags,
    security,
    summary: 'Send a test message now and report how it went',
    middleware: [requireRole('admin')],
    request: { params: IdParam },
    responses: {
      200: json(
        z.object({
          ok: z.boolean(),
          status: z.number().int().nullable(),
          error: z.string().nullable(),
        }),
        'Result',
      ),
      404: problemResponse('Not found'),
    },
  }),
  async (c) => c.json(await testWebhook(c.env, c.req.valid('param').id), 200),
);
