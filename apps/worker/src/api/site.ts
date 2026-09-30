import { createRoute, z } from '@hono/zod-openapi';
import { db } from '../db/client';
import { getSetting, SITE_TITLE } from '../services/settings';
import { router } from './router';
import { json } from './schemas';

export const SiteSchema = z
  .object({
    title: z.string().nullable().openapi({
      description: 'Shown as "Clavis - {title}"; null shows just "Clavis"',
      example: 'Payments team',
    }),
  })
  .openapi('Site');

/** What an admin may set: up to 40 characters, no line breaks; empty clears it. */
export const SiteTitleInput = z
  .string()
  .trim()
  .max(40)
  .regex(/^\P{Cc}*$/u, 'Line breaks and control characters are not allowed');

// No role check: the header shows the title to people still awaiting approval, too.
export const site = router().openapi(
  createRoute({
    method: 'get',
    path: '/site',
    tags: ['system'],
    summary: 'The site title an admin set (readable while approval is pending)',
    security: [{ bearer: [] }],
    responses: { 200: json(SiteSchema, 'Site') },
  }),
  async (c) => c.json({ title: await getSetting(db(c.env.DB), SITE_TITLE) }, 200),
);
