import type { ActorRef, NotificationList, WatchState } from '@clavis/shared/schema';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from './api';

/** The bell: polled while the tab is visible (notifications arrive a few seconds late). */
export const notificationsQuery = queryOptions({
  queryKey: ['notifications'],
  queryFn: () => apiGet<NotificationList>('/me/notifications?limit=30'),
  refetchInterval: 60_000,
});

export function useNotificationActions() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const read = useMutation({
    mutationFn: (ids?: string[]) => apiSend('POST', '/me/notifications/read', { ids }),
    onSettled: refresh,
  });
  const muteAgentEdits = useMutation({
    mutationFn: (mute: boolean) =>
      apiSend('PUT', '/me/notifications/settings', { muteAgentEdits: mute }),
    onSettled: refresh,
  });
  return { read, muteAgentEdits };
}

export const watchQuery = (pageId: string) =>
  queryOptions({
    queryKey: ['watch', pageId],
    queryFn: () => apiGet<WatchState>(`/pages/${encodeURIComponent(pageId)}/watch`),
  });

export function useSetWatch(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: 'watch' | 'mute' | null) =>
      apiSend<WatchState>('PUT', `/pages/${encodeURIComponent(pageId)}/watch`, { mode }),
    onSuccess: (state) => queryClient.setQueryData(['watch', pageId], state),
  });
}

/** Who can be @mentioned; fetched once when a comment box is first used. */
export function useMentionable(enabled: boolean) {
  return useQuery({
    queryKey: ['actors'],
    queryFn: () => apiGet<{ actors: ActorRef[] }>('/actors').then((r) => r.actors),
    staleTime: 5 * 60_000,
    enabled,
  });
}
