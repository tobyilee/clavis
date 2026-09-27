import type { Backlink, RecheckResult, SpaceHealth } from '@clavis/shared/schema';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiGet, apiSend } from './api';

export const healthQuery = (key: string) =>
  queryOptions({
    queryKey: ['health', key.toUpperCase()],
    queryFn: () => apiGet<SpaceHealth>(`/spaces/${encodeURIComponent(key)}/health`),
  });

export const backlinksQuery = (pageId: string) =>
  queryOptions({
    queryKey: ['backlinks', pageId],
    queryFn: () =>
      apiGet<{ backlinks: Backlink[] }>(`/pages/${encodeURIComponent(pageId)}/backlinks`).then(
        (r) => r.backlinks,
      ),
  });

/**
 * Rechecks stale pages one chunk per request until none are left (D-46), then refreshes the
 * dashboard. Each call lints about 100KB, so a Space of a few MB takes a few dozen calls.
 */
export function useRecheck(key: string, stale: number) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    if (stale === 0) return;
    // Rechecking is idempotent, so a second run (StrictMode, remount) only repeats a chunk.
    let cancelled = false;
    void (async () => {
      let done = 0;
      setProgress({ done, total: stale });
      try {
        for (;;) {
          const r = await apiSend<RecheckResult>(
            'POST',
            `/spaces/${encodeURIComponent(key)}/lint/recheck`,
          );
          if (cancelled) return;
          done += r.checked;
          setProgress({ done, total: done + r.remaining });
          // No progress means the rest raced with saves; the next visit picks them up.
          if (r.remaining === 0 || r.checked === 0) break;
        }
      } finally {
        if (!cancelled) {
          setProgress(null);
          void queryClient.invalidateQueries({ queryKey: ['health', key.toUpperCase()] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, stale, queryClient]);

  return progress;
}
