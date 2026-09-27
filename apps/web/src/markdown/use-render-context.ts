import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { indexTree, treeQuery } from '@/lib/queries';
import { pagePath } from '@/lib/urls';
import type { CalloutKind, ResolveAttachment } from './plugins';
import type { RenderContext } from './render';

/**
 * Render context for pages of `spaceKey`: wiki links resolve against the cached space tree
 * (no request per link), attachments against the page's attachment list.
 */
export function useRenderContext(
  spaceKey: string,
  resolveAttachment: ResolveAttachment = () => null,
): RenderContext {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tree = useQuery(treeQuery(queryClient, spaceKey));
  const index = useMemo(() => indexTree(tree.data?.tree ?? []), [tree.data]);
  const key = spaceKey.toUpperCase();

  return useMemo(
    () => ({
      resolveWiki: (linkKey, title) => {
        const target = linkKey ?? key;
        const byTitle = `/s/${target}/w/${encodeURIComponent(title)}`;
        if (target !== key) return { href: byTitle, exists: true };
        const node = index.byTitle.get(title);
        // While the tree loads, don't flag links as broken.
        if (!node) return { href: byTitle, exists: !tree.data };
        return {
          href: pagePath({ spaceKey: key, slug: node.slug, shortId: node.shortId }),
          exists: true,
        };
      },
      resolveAttachment,
      calloutLabels: Object.fromEntries(
        (['note', 'tip', 'important', 'warning', 'caution'] as CalloutKind[]).map((k) => [
          k,
          t(`callout.${k}`),
        ]),
      ) as Record<CalloutKind, string>,
    }),
    [index, key, tree.data, resolveAttachment, t],
  );
}
