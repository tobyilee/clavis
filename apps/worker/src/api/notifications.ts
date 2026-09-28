import {
  ActorRefSchema,
  MarkReadSchema,
  NotificationListSchema,
  NotificationSettingsSchema,
  SetWatchSchema,
  WatchStateSchema,
} from '@clavis/shared/schema';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import {
  listNotifications,
  markRead,
  mentionable,
  setMuteAgentEdits,
  setWatch,
  watchState,
} from '../services/notifications';
import { problemResponse } from './problem';
import { router } from './router';
import { json, PageRefParam } from './schemas';

/** In-app notifications, watching pages and @mention targets (D-57 ~ D-59). */
export const notifications = router();
const tags = ['notifications'];
const security = [{ bearer: [] }];

const NotificationList = NotificationListSchema.openapi('NotificationList');
const WatchState = WatchStateSchema.openapi('WatchState');

notifications.openapi(
  createRoute({
    method: 'get',
    path: '/me/notifications',
    tags,
    security,
    summary: 'My notifications, newest first, with the unread count',
    description:
      'People get page changes, new comments and @mentions on pages they watch; agents get @mentions only (D-59).',
    middleware: [requireRole('viewer')],
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        unread: z.enum(['true', 'false']).optional(),
        kind: z.enum(['page.changed', 'comment', 'mention']).optional(),
      }),
    },
    responses: { 200: json(NotificationList, 'Notifications') },
  }),
  async (c) => {
    const q = c.req.valid('query');
    return c.json(
      await listNotifications(c.env.DB, c.get('actor'), {
        limit: q.limit,
        unreadOnly: q.unread === 'true',
        kind: q.kind,
      }),
      200,
    );
  },
);

notifications.openapi(
  createRoute({
    method: 'post',
    path: '/me/notifications/read',
    tags,
    security,
    summary: 'Mark notifications read (all of them when `ids` is omitted)',
    middleware: [requireRole('viewer')],
    request: { body: { content: { 'application/json': { schema: MarkReadSchema } } } },
    responses: { 200: json(z.object({ marked: z.number().int() }), 'Marked') },
  }),
  async (c) =>
    c.json({ marked: await markRead(c.env.DB, c.get('actor'), c.req.valid('json').ids) }, 200),
);

notifications.openapi(
  createRoute({
    method: 'put',
    path: '/me/notifications/settings',
    tags,
    security,
    summary: 'Notification preferences',
    middleware: [requireRole('viewer')],
    request: {
      body: { content: { 'application/json': { schema: NotificationSettingsSchema } } },
    },
    responses: { 200: json(NotificationSettingsSchema, 'Saved') },
  }),
  async (c) => {
    const { muteAgentEdits } = c.req.valid('json');
    await setMuteAgentEdits(c.env.DB, c.get('actor'), muteAgentEdits);
    return c.json({ muteAgentEdits }, 200);
  },
);

notifications.openapi(
  createRoute({
    method: 'get',
    path: '/pages/{ref}/watch',
    tags,
    security,
    summary: 'Whether I am notified about this page, and why',
    middleware: [requireRole('viewer')],
    request: { params: PageRefParam },
    responses: { 200: json(WatchState, 'Watch state'), 404: problemResponse('Not found') },
  }),
  async (c) => {
    const { pageId: _pageId, ...state } = await watchState(
      c.env.DB,
      c.get('actor'),
      c.req.valid('param').ref,
    );
    return c.json(state, 200);
  },
);

notifications.openapi(
  createRoute({
    method: 'put',
    path: '/pages/{ref}/watch',
    tags,
    security,
    summary: 'Watch or mute a page, or go back to the automatic choice (`mode: null`)',
    middleware: [requireRole('viewer')],
    request: {
      params: PageRefParam,
      body: { content: { 'application/json': { schema: SetWatchSchema } } },
    },
    responses: { 200: json(WatchState, 'Watch state'), 404: problemResponse('Not found') },
  }),
  async (c) => {
    const { pageId: _pageId, ...state } = await setWatch(
      c.env.DB,
      c.get('actor'),
      c.req.valid('param').ref,
      c.req.valid('json').mode,
    );
    return c.json(state, 200);
  },
);

notifications.openapi(
  createRoute({
    method: 'get',
    path: '/actors',
    tags,
    security,
    summary: 'People and agents one can @mention',
    middleware: [requireRole('viewer')],
    responses: { 200: json(z.object({ actors: z.array(ActorRefSchema) }), 'Actors') },
  }),
  async (c) => c.json({ actors: await mentionable(c.env.DB) }, 200),
);
