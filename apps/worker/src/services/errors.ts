import type { Violation } from '@clavis/shared/schema';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * A domain failure with its HTTP meaning. Services throw it; the REST app turns it into
 * problem+json and the MCP server into a tool error, so both report the same thing.
 */
export class ServiceError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly slug: string,
    readonly title: string,
    readonly extra: { detail?: string; violations?: Violation[]; revision?: number } = {},
  ) {
    super(title);
  }
}

export const notFound = (what: string) => new ServiceError(404, 'not-found', `${what} not found`);
