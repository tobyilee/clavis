import { ViolationSchema } from '@clavis/shared/schema';
import { renderTemplate, TEMPLATES } from '@clavis/shared/templates';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { lintContent } from '../services/links';
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
    summary: 'Document templates and their required sections',
    middleware: [requireRole('viewer')],
    request: { query: z.object({ locale: z.enum(['ko', 'en']).default('ko') }) },
    responses: { 200: json(z.object({ templates: z.array(Template) }), 'Templates') },
  }),
  (c) => {
    const { locale } = c.req.valid('query');
    const actor = c.get('actor');
    const templates = TEMPLATES.map((t) => ({
      type: t.type,
      name: t.name[locale],
      description: t.description[locale],
      requiredSections: t.sections.map((s) => s[locale]),
      content: renderTemplate(t.type, { owner: actor.email ?? actor.name, locale }),
    }));
    return c.json({ templates }, 200);
  },
);
