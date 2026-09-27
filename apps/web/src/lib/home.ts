import type { Home, PageListItem } from '@clavis/shared/schema';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from './api';

export const homeQuery = queryOptions({
  queryKey: ['home'],
  queryFn: () => apiGet<Home>('/me/home'),
});

export const favoritesQuery = queryOptions({
  queryKey: ['favorites'],
  queryFn: () => apiGet<{ favorites: PageListItem[] }>('/me/favorites').then((r) => r.favorites),
  staleTime: 60_000,
});

/** Whether a page is starred, and a toggle that updates the lists right away. */
export function useFavorite(pageId: string) {
  const queryClient = useQueryClient();
  const favorites = useQuery(favoritesQuery);
  const starred = favorites.data?.some((f) => f.id === pageId) ?? false;
  const toggle = useMutation({
    mutationFn: () => apiSend(starred ? 'DELETE' : 'PUT', `/pages/${pageId}/favorite`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] });
      void queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });
  return { starred, toggle: () => toggle.mutate(), pending: toggle.isPending };
}
