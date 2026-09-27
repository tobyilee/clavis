import type { Problem, Violation } from '@clavis/shared/schema';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const PROBLEM_BASE = 'https://clavis.dev/problems/';

/** RFC 9457 problem details response. */
export function problem(
  c: Context,
  status: ContentfulStatusCode,
  slug: string,
  title: string,
  extra: { detail?: string; violations?: Violation[] } = {},
) {
  const body: Problem = { type: PROBLEM_BASE + slug, title, status, ...extra };
  return c.body(JSON.stringify(body), status, { 'content-type': 'application/problem+json' });
}
