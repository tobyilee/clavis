import { admin } from './admin';
import { attachments } from './attachments';
import { authoring } from './authoring';
import { docs } from './docs';
import { health } from './health';
import { me } from './me';
import { pages } from './pages';
import { quality } from './quality';
import { router } from './router';
import { search } from './search';
import { spaces } from './spaces';
import { trash } from './trash';

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
    admin,
    spaces,
    pages,
    quality,
    trash,
    search,
    authoring,
    attachments,
    docs,
  ]) {
    api.route('/', r);
  }
  return api;
}
