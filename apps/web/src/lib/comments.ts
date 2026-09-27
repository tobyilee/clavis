import type { Thread } from '@clavis/shared/schema';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from './api';

export const threadsQuery = (pageId: string) =>
  queryOptions({
    queryKey: ['comments', pageId],
    queryFn: () =>
      apiGet<{ threads: Thread[] }>(`/pages/${encodeURIComponent(pageId)}/comments`).then(
        (r) => r.threads,
      ),
  });

type CommentAction =
  | { kind: 'add'; body: string; replyTo?: string; sectionId?: string }
  | { kind: 'edit'; id: string; body: string }
  | { kind: 'delete'; id: string }
  | { kind: 'resolve' | 'reopen'; id: string };

/** Every comment change, refetching the page's threads afterwards. */
export function useCommentAction(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (a: CommentAction) => {
      switch (a.kind) {
        case 'add':
          return apiSend('POST', `/pages/${encodeURIComponent(pageId)}/comments`, {
            body: a.body,
            replyTo: a.replyTo,
            sectionId: a.sectionId,
          });
        case 'edit':
          return apiSend('PATCH', `/comments/${a.id}`, { body: a.body });
        case 'delete':
          return apiSend('DELETE', `/comments/${a.id}`);
        default:
          return apiSend('POST', `/comments/${a.id}/${a.kind}`);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['comments', pageId] }),
  });
}

/** Open threads per section id, for the badges next to headings. */
export function sectionCounts(threads: Thread[] | undefined) {
  const counts = new Map<string, { count: number; first: string }>();
  for (const t of threads ?? []) {
    if (!t.sectionId || t.resolvedAt !== null) continue;
    const c = counts.get(t.sectionId);
    if (c) c.count++;
    else counts.set(t.sectionId, { count: 1, first: t.id });
  }
  return counts;
}
