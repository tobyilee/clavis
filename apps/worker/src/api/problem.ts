import { type Problem, ProblemSchema, type Violation } from '@clavis/shared/schema';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const PROBLEM_BASE = 'https://clavis.dev/problems/';

/** RFC 9457 problem details. Typed as JSON so it satisfies OpenAPI route response types. */
export function problem<S extends ContentfulStatusCode>(
  c: Context,
  status: S,
  slug: string,
  title: string,
  extra: { detail?: string; violations?: Violation[] } = {},
) {
  const body: Problem = { type: PROBLEM_BASE + slug, title, status, ...extra };
  // c.json only sets application/json when no content-type is given.
  return c.json(body, status, { 'content-type': 'application/problem+json' });
}

/** OpenAPI response entry for a problem+json error. */
export const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
});
