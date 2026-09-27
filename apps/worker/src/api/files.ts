import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { requireRole } from '../auth/middleware';
import { fileInfo } from '../services/attachments';
import { problem } from './problem';

// Types a browser could run as a document; they are always downloaded, never displayed.
const ACTIVE_TYPES = /^(text\/html|application\/xhtml|image\/svg|text\/xml|application\/xml)/i;

/**
 * GET /files/{id}: streams an attachment from the private R2 bucket (arch §10.1). The
 * sandbox CSP means even a mislabeled file cannot run script on the Clavis origin.
 */
export const files = new Hono<AppEnv>().get('/files/:id', requireRole('viewer'), async (c) => {
  const info = await fileInfo(c.env.DB, c.req.param('id'));
  if (!info) return problem(c, 404, 'not-found', 'File not found');
  const etag = c.req.header('if-none-match');
  const object = await c.env.FILES.get(info.r2_key, {
    onlyIf: etag ? { etagDoesNotMatch: etag.replace(/^W\//, '').replaceAll('"', '') } : undefined,
  });
  if (!object) return problem(c, 404, 'not-found', 'File not found');

  const headers = new Headers({
    'content-type': info.mime_type,
    'cache-control': 'private, max-age=86400',
    etag: object.httpEtag,
    'x-content-type-options': 'nosniff',
    'content-security-policy':
      "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
  });
  const disposition = ACTIVE_TYPES.test(info.mime_type) ? 'attachment' : 'inline';
  headers.set(
    'content-disposition',
    `${disposition}; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
  );
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
});
