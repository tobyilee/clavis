import type { Page, Space, TreeNode } from '@clavis/shared/schema';
import { type QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import { apiFetch, apiGet, isApiError } from './api';

export interface SpaceTree {
  treeVersion: number;
  tree: TreeNode[];
}

export const spacesQuery = (includeArchived = false) =>
  queryOptions({
    queryKey: ['spaces', { includeArchived }],
    queryFn: () =>
      apiGet<{ spaces: Space[] }>(`/spaces${includeArchived ? '?includeArchived=true' : ''}`).then(
        (r) => r.spaces,
      ),
  });

export const spaceQuery = (key: string) =>
  queryOptions({
    queryKey: ['space', key.toUpperCase()],
    queryFn: () => apiGet<Space>(`/spaces/${encodeURIComponent(key)}`),
  });

/**
 * The page tree, revalidated with the server's ETag: an unchanged tree costs the Worker one
 * small query and returns 304, and the cached tree is reused.
 */
export function treeQuery(queryClient: QueryClient, key: string) {
  const queryKey = ['tree', key.toUpperCase()] as const;
  return queryOptions({
    queryKey,
    queryFn: async (): Promise<SpaceTree> => {
      const cached = queryClient.getQueryData<SpaceTree>(queryKey);
      const res = await apiFetch(`/spaces/${encodeURIComponent(key)}/tree`, {
        headers: cached
          ? { 'if-none-match': `W/"tree-${key.toUpperCase()}-${cached.treeVersion}"` }
          : {},
      });
      if (res.status === 304 && cached) return cached;
      return (await res.json()) as SpaceTree;
    },
    staleTime: 10_000,
  });
}

export const pageQuery = (ref: string) =>
  queryOptions({
    queryKey: ['page', ref],
    queryFn: () => apiGet<Page>(`/pages/${encodeURIComponent(ref)}`),
    retry: (count, err) => !isApiError(err, 404) && count < 1,
  });

export function useSpaces() {
  return useQuery(spacesQuery());
}

/** Flattened tree lookup: title → node, plus each node's parent chain. */
export interface TreeIndex {
  byTitle: Map<string, TreeNode>;
  byShortId: Map<string, TreeNode>;
  parents: Map<string, string | null>;
}

export function indexTree(tree: TreeNode[]): TreeIndex {
  const index: TreeIndex = { byTitle: new Map(), byShortId: new Map(), parents: new Map() };
  const walk = (nodes: TreeNode[], parent: string | null) => {
    for (const n of nodes) {
      index.byTitle.set(n.title, n);
      index.byShortId.set(n.shortId, n);
      index.parents.set(n.shortId, parent);
      walk(n.children, n.shortId);
    }
  };
  walk(tree, null);
  return index;
}
