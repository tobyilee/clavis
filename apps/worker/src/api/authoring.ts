import { CreateTemplateSchema, SaveTemplateSchema, ViolationSchema } from '@clavis/shared/schema';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { lintContent } from '../services/links';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
} from '../services/templates';
import { problemResponse } from './problem';
import { router } from './router';
import { json, Template } from './schemas';

export const authoring = router();
const security = [{ bearer: [] }];

authoring.openapi(
  createRoute({
    method: 'post',
    path: '/lint',
    tags: ['authoring'],
    security,
    summary: 'Check Markdown against the rules without saving',
    description:
      'Runs every server rule. Give `space` (or `page`) to check wiki links, and `page` to check attachments.',
    middleware: [requireRole('viewer')],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              content: z.string().max(200_000),
              space: z.string().optional(),
              page: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: json(z.object({ violations: z.array(ViolationSchema) }), 'All findings'),
    },
  }),
  async (c) => {
    const { content, ...opts } = c.req.valid('json');
    return c.json({ violations: await lintContent(c.env.DB, content, opts) }, 200);
  },
);

authoring.openapi(
  createRoute({
    method: 'get',
    path: '/templates',
    tags: ['authoring'],
    security,
    summary: 'Templates: custom ones for the space and every space, then the built-in ones',
    description:
      'Give `space` to include its templates and its required sections (D-47, D-49). Pass a template `id` as `template` when creating a page.',
    middleware: [requireRole('viewer')],
    request: {
      query: z.object({ locale: z.enum(['ko', 'en']).default('ko'), space: z.string().optional() }),
    },
    responses: {
      200: json(z.object({ templates: z.array(Template) }), 'Templates'),
      404: problemResponse('Space not found'),
    },
  }),
  async (c) => {
    const templates = await listTemplates(c.env.DB, c.get('actor'), c.req.valid('query'));
    return c.json({ templates }, 200);
  },
);

authoring.openapi(
  createRoute({
    method: 'post',
    path: '/templates',
    tags: ['authoring'],
    security,
    summary: 'Create a custom template (editor; admin for `space: null`, every space)',
    description:
      'The content is checked like a page with the space rules; {{title}}, {{owner}} and {{date}} are filled in when a page is created from it.',
    middleware: [requireRole('editor')],
    request: { body: { content: { 'application/json': { schema: CreateTemplateSchema } } } },
    responses: {
      201: json(z.object({ id: z.string() }), 'Created'),
      403: problemResponse('Every-space templates are admin only'),
      404: problemResponse('Space not found'),
      422: problemResponse('Lint errors (see `violations`)'),
    },
  }),
  async (c) =>
    c.json({ id: await createTemplate(c.env.DB, c.get('actor'), c.req.valid('json')) }, 201),
);

const TemplateIdParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' }, description: 'Template id' }),
});

authoring.openapi(
  createRoute({
    method: 'put',
    path: '/templates/{id}',
    tags: ['authoring'],
    security,
    summary: 'Update a custom template',
    middleware: [requireRole('editor')],
    request: {
      params: TemplateIdParam,
      body: { content: { 'application/json': { schema: SaveTemplateSchema } } },
    },
    responses: {
      204: { description: 'Updated' },
      403: problemResponse('Every-space templates are admin only'),
      404: problemResponse('Not found'),
      422: problemResponse('Lint errors (see `violations`)'),
    },
  }),
  async (c) => {
    await updateTemplate(c.env.DB, c.get('actor'), c.req.valid('param').id, c.req.valid('json'));
    return c.body(null, 204);
  },
);

authoring.openapi(
  createRoute({
    method: 'delete',
    path: '/templates/{id}',
    tags: ['authoring'],
    security,
    summary: 'Delete a custom template (pages made from it are not affected)',
    middleware: [requireRole('editor')],
    request: { params: TemplateIdParam },
    responses: {
      204: { description: 'Deleted' },
      403: problemResponse('Every-space templates are admin only'),
      404: problemResponse('Not found'),
    },
  }),
  async (c) => {
    await deleteTemplate(c.env.DB, c.get('actor'), c.req.valid('param').id);
    return c.body(null, 204);
  },
);
