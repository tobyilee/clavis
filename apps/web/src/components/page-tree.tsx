import type { TreeNode } from '@clavis/shared/schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { indexTree, treeQuery } from '@/lib/queries';
import { storage } from '@/lib/storage';
import { pageParams } from '@/lib/urls';
import { StatusDot } from './status';

const expandedKey = (spaceKey: string) => `clavis.tree.${spaceKey}`;

function loadExpanded(spaceKey: string): Set<string> {
  try {
    return new Set(JSON.parse(storage.get(expandedKey(spaceKey)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function PageTree({
  spaceKey,
  activeShortId,
}: {
  spaceKey: string;
  activeShortId: string | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tree = useQuery(treeQuery(queryClient, spaceKey));
  const [expanded, setExpanded] = useState(() => loadExpanded(spaceKey));
  const index = useMemo(() => indexTree(tree.data?.tree ?? []), [tree.data]);

  useEffect(() => setExpanded(loadExpanded(spaceKey)), [spaceKey]);

  // Reveal the current page: expand every ancestor.
  useEffect(() => {
    if (!activeShortId) return;
    const ancestors: string[] = [];
    for (let p = index.parents.get(activeShortId) ?? null; p; p = index.parents.get(p) ?? null) {
      ancestors.push(p);
    }
    if (ancestors.length === 0) return;
    setExpanded((prev) => {
      if (ancestors.every((a) => prev.has(a))) return prev;
      return new Set([...prev, ...ancestors]);
    });
  }, [activeShortId, index]);

  const toggle = (shortId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(shortId)) next.delete(shortId);
      else next.add(shortId);
      storage.set(expandedKey(spaceKey), JSON.stringify([...next]));
      return next;
    });

  if (tree.isPending) return <p className="px-2 py-2 text-xs text-muted-foreground">…</p>;
  if (tree.isError) return <p className="px-2 py-2 text-xs text-destructive">{t('error.load')}</p>;
  if (tree.data.tree.length === 0) {
    return <p className="px-2 py-2 text-xs text-muted-foreground">{t('tree.empty')}</p>;
  }
  return (
    <ul className="flex flex-col">
      {tree.data.tree.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          depth={0}
          spaceKey={spaceKey}
          activeShortId={activeShortId}
          expanded={expanded}
          onToggle={toggle}
        />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  depth,
  spaceKey,
  activeShortId,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  spaceKey: string;
  activeShortId: string | null;
  expanded: Set<string>;
  onToggle: (shortId: string) => void;
}) {
  const open = expanded.has(node.shortId);
  const active = node.shortId === activeShortId;
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md pr-2 text-sm hover:bg-accent',
          active && 'bg-accent font-medium',
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <button
          type="button"
          onClick={() => onToggle(node.shortId)}
          aria-expanded={hasChildren ? open : undefined}
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded',
            !hasChildren && 'invisible',
          )}
          aria-label={open ? 'Collapse' : 'Expand'}
          tabIndex={hasChildren ? 0 : -1}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
        <Link
          to="/s/$key/p/$slugId"
          params={pageParams({ spaceKey, slug: node.slug, shortId: node.shortId })}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 py-1',
            node.status === 'deprecated' && 'text-muted-foreground line-through',
          )}
        >
          <span className="truncate">{node.title}</span>
          <StatusDot status={node.status} className="ml-auto opacity-0 group-hover:opacity-100" />
        </Link>
      </div>
      {hasChildren && open && (
        <ul>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              spaceKey={spaceKey}
              activeShortId={activeShortId}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
