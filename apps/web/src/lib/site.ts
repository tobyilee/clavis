import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiGet, apiSend } from './api';

/** "Clavis - {title}", or just "Clavis" (D-64). The header and the browser tab both show it. */
export const formatSiteTitle = (title: string | null | undefined) =>
  title ? `Clavis - ${title}` : 'Clavis';

// The last title seen, so a reload does not flash plain "Clavis" first. Storage can be
// unavailable (private windows, blocked site data); the title then arrives with the request.
const STORAGE_KEY = 'clavis.siteTitle';

function remembered(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function remember(title: string | null) {
  try {
    if (title) localStorage.setItem(STORAGE_KEY, title);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Only a convenience.
  }
}

export function useSite() {
  return useQuery({
    queryKey: ['site'],
    queryFn: async () => {
      const { title } = await apiGet<{ title: string | null }>('/site');
      remember(title);
      return title;
    },
    placeholderData: remembered,
    staleTime: 5 * 60_000,
    // Signed out: the header shows plain "Clavis", as AuthGate explains the rest.
    retry: (count, err) => !(err instanceof ApiError && err.problem.status === 401) && count < 1,
  });
}

export function useSaveSiteTitle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) =>
      apiSend<{ title: string | null }>('PUT', '/admin/site', { title }).then((r) => r.title),
    onSuccess: (title) => {
      remember(title);
      queryClient.setQueryData(['site'], title);
    },
  });
}
