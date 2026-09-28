import { admin } from './admin';
import { attachments } from './attachments';
import { authoring } from './authoring';
import { comments } from './comments';
import { docs } from './docs';
import { health } from './health';
import { home } from './home';
import { me } from './me';
import { notifications } from './notifications';
import { pages } from './pages';
import { quality } from './quality';
import { revisions } from './revisions';
import { router } from './router';
import { search } from './search';
import { sections } from './sections';
import { spaces } from './spaces';
import { trash } from './trash';
import { webhooks } from './webhooks';

export const OPENAPI_CONFIG = {
  openapi: '3.1.0',
  info: { title: 'Clavis API', version: 'v1' },
};

/** Every /api/v1 route. Kept free of Workers-only imports so a Node script can build the spec. */
export function buildApi() {
  const api = router();
  api.openAPIRegistry.registerComponent('securitySchemes', 'bearer', {
    type: 'http',
    scheme: 'bearer',
    description: 'Agent API token (clv_…). People are identified by Cloudflare Access instead.',
  });
  for (const r of [
    health,
    me,
    home,
    notifications,
    admin,
    spaces,
    pages,
    sections,
    revisions,
    comments,
    quality,
    trash,
    webhooks,
    search,
    authoring,
    attachments,
    docs,
  ]) {
    api.route('/', r);
  }
  return api;
}
