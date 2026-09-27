import { parseSlugId } from '@clavis/shared/schema';
import { useParams } from '@tanstack/react-router';

/** The space key and page short id of the current route, when there are any. */
export function useCurrentLocation(): { spaceKey: string | null; shortId: string | null } {
  const params = useParams({ strict: false }) as { key?: string; slugId?: string };
  return {
    spaceKey: params.key?.toUpperCase() ?? null,
    shortId: params.slugId ? parseSlugId(params.slugId) : null,
  };
}
