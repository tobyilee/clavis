import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { deleteAttachment, listAttachments, uploadAttachment } from '../services/attachments';
import { problemResponse } from './problem';
import { router } from './router';
import { Attachment, json, PageRefParam } from './schemas';

export const attachments = router();
const tags = ['attachments'];
const security = [{ bearer: [] }];

attachments.openapi(
  createRoute({
    method: 'get',
    path: '/pages/{ref}/attachments',
    tags,
    security,
    summary: "A page's attachments",
    middleware: [requireRole('viewer')],
    request: { params: PageRefParam },
    responses: {
      200: json(z.object({ attachments: z.array(Attachment) }), 'Attachments by name'),
      404: problemResponse('Page not found'),
    },
  }),
  async (c) =>
    c.json({ attachments: await listAttachments(c.env.DB, c.req.valid('param').ref) }, 200),
);

attachments.openapi(
  createRoute({
    method: 'post',
    path: '/pages/{ref}/attachments',
    tags,
    security,
    summary: 'Upload an attachment (raw body, up to 25MB)',
    description:
      'Send the file bytes as the body with its Content-Type and Content-Length, and the name in `?filename=`. The stored name may differ (cleaned, or "-1" added when taken); reference it as `attachments/<filename>` in Markdown.',
    middleware: [requireRole('editor')],
    request: {
      params: PageRefParam,
      query: z.object({ filename: z.string().min(1).max(255) }),
      body: {
        content: {
          'application/octet-stream': { schema: z.string().openapi({ format: 'binary' }) },
        },
      },
    },
    responses: {
      201: json(Attachment, 'Stored'),
      404: problemResponse('Page not found'),
      411: problemResponse('Content-Length required'),
      413: problemResponse('Over 25MB'),
    },
  }),
  async (c) => {
    const length = Number(c.req.header('content-length'));
    const body = c.req.raw.body;
    if (!body || !Number.isFinite(length) || length <= 0) {
      return c.json(
        {
          type: 'https://clavis.dev/problems/length-required',
          title: 'Content-Length required',
          status: 411,
        },
        411,
        { 'content-type': 'application/problem+json' },
      );
    }
    const attachment = await uploadAttachment(c.env, c.get('actor'), c.req.valid('param').ref, {
      name: c.req.valid('query').filename,
      type: c.req.header('content-type') ?? '',
      size: length,
      body,
    });
    return c.json(attachment, 201);
  },
);

attachments.openapi(
  createRoute({
    method: 'delete',
    path: '/attachments/{id}',
    tags,
    security,
    summary: 'Delete an attachment',
    description:
      'Pages that still reference it will fail lint (attachment-exists) on their next save.',
    middleware: [requireRole('editor')],
    request: {
      params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }),
    },
    responses: { 204: { description: 'Deleted' }, 404: problemResponse('Not found') },
  }),
  async (c) => {
    await deleteAttachment(c.env, c.req.valid('param').id);
    return c.body(null, 204);
  },
);
