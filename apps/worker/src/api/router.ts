import { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../app';
import { problem } from './problem';

/** Every API router is created here so request validation errors are always problem+json. */
export function router() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return problem(c, 400, 'invalid-request', 'Request validation failed', {
          detail: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        });
      }
    },
  });
}
