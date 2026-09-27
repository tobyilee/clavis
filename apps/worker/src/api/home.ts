import { HomeSchema, PageListItemSchema } from '@clavis/shared/schema';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { getHome, listFavorites, setFavorite } from '../services/home';
import { problemResponse } from './problem';
import { router } from './router';
import { json, PageRefParam } from './schemas';

export const home = router();
const tags = ['home'];
const security = [{ bearer: [] }];

const PageListItem = PageListItemSchema.openapi('PageListItem');

home.openapi(
  createRoute({
    method: 'get',
    path: '/me/home',
    tags,
    security,
    summary: 'Home page: favorites, recently viewed, recent changes, open comments on my pages',
    middleware: [requireRole('viewer')],
    responses: { 200: json(HomeSchema.openapi('Home'), 'Home') },
  }),
  async (c) => c.json(await getHome(c.env.DB, c.get('actor')), 200),
);

home.openapi(
  createRoute({
    method: 'get',
    path: '/me/favorites',
    tags,
    security,
    summary: 'My starred pages, newest first',
    middleware: [requireRole('viewer')],
    responses: { 200: json(z.object({ favorites: z.array(PageListItem) }), 'Favorites') },
  }),
  async (c) => c.json({ favorites: await listFavorites(c.env.DB, c.get('actor')) }, 200),
);

for (const [method, on] of [
  ['put', true],
  ['delete', false],
] as const) {
  home.openapi(
    createRoute({
      method,
      path: '/pages/{ref}/favorite',
      tags,
      security,
      summary: on ? 'Star a page' : 'Unstar a page',
      middleware: [requireRole('viewer')],
      request: { params: PageRefParam },
      responses: { 204: { description: 'Done' }, 404: problemResponse('Not found') },
    }),
    async (c) => {
      await setFavorite(c.env.DB, c.get('actor'), c.req.valid('param').ref, on);
      return c.body(null, 204);
    },
  );
}
