import type { TreeNode } from '@clavis/shared/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { ChevronRight, Plus } from 'lucide-react';
import { createContext, type DragEvent, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiSend } from '@/lib/api';
import { useCanEdit } from '@/lib/me';
import { indexTree, type TreeIndex, treeQuery } from '@/lib/queries';
import { storage } from '@/lib/storage';
import { pageParams } from '@/lib/urls';
import { titleIfTruncated } from '@/lib/utils';
import { StatusDot } from './status';

const expandedKey = (spaceKey: string) => `clavis.tree.${spaceKey}`;

type DropZone = 'before' | 'inside' | 'after';
interface DragState {
  enabled: boolean;
  dragging: string | null;
  over: { shortId: string; zone: DropZone } | null;
  start(shortId: string): void;
  hover(e: DragEvent, shortId: string): void;
  drop(e: DragEvent, shortId: string): void;
  end(): void;
}
const DragContext = createContext<DragState | null>(null);

/** Is `shortId` the dragged page or inside it? Dropping there would create a cycle. */
function isWithin(index: TreeIndex, shortId: string, ancestor: string): boolean {
  for (let p: string | null = shortId; p; p = index.parents.get(p) ?? null) {
    if (p === ancestor) return true;
  }
  return false;
}

/** Desktop drag & drop: top quarter = before, bottom quarter = after, middle = inside. */
function useTreeDrag(
  spaceKey: string,
  index: TreeIndex,
  onExpand: (shortId: string) => void,
): DragState {
  const queryClient = useQueryClient();
  const enabled = useCanEdit();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<DragState['over']>(null);
  const move = useMutation({
    mutationFn: (v: { page: string; body: Record<string, unknown> }) =>
      apiSend('POST', `/pages/${v.page}/move`, v.body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tree', spaceKey] });
      void queryClient.invalidateQueries({ queryKey: ['page'] });
    },
  });
  const zoneOf = (e: DragEvent): DropZone => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside';
  };
  return {
    enabled,
    dragging,
    over,
    start: setDragging,
    hover(e, shortId) {
      if (!dragging || isWithin(index, shortId, dragging)) return;
      e.preventDefault();
      const zone = zoneOf(e);
      if (over?.shortId !== shortId || over.zone !== zone) setOver({ shortId, zone });
    },
    drop(e, shortId) {
      e.preventDefault();
      const page = dragging;
      setDragging(null);
      setOver(null);
      if (!page || isWithin(index, shortId, page)) return;
      const zone = zoneOf(e);
      const parent = index.parents.get(shortId) ?? null;
      const body = zone === 'inside' ? { parent: shortId } : { parent, [zone]: shortId };
      if (zone === 'inside') onExpand(shortId);
      move.mutate({ page, body });
    },
    end() {
      setDragging(null);
      setOver(null);
    },
  };
}

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

  const drag = useTreeDrag(spaceKey, index, (shortId) =>
    setExpanded((prev) => (prev.has(shortId) ? prev : new Set([...prev, shortId]))),
  );

  if (tree.isPending) return <p className="px-2 py-2 text-xs text-muted-foreground">…</p>;
  if (tree.isError) return <p className="px-2 py-2 text-xs text-destructive">{t('error.load')}</p>;
  if (tree.data.tree.length === 0) {
    return <p className="px-2 py-2 text-xs text-muted-foreground">{t('tree.empty')}</p>;
  }
  return (
    <DragContext.Provider value={drag}>
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
    </DragContext.Provider>
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
  const { t } = useTranslation();
  const drag = useContext(DragContext);
  const zone = drag?.over?.shortId === node.shortId ? drag.over.zone : null;
  return (
    <li>
      {/* Drag & drop is a mouse shortcut; keyboard and touch users move pages with the page menu. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: see above */}
      <div
        draggable={drag?.enabled}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          drag?.start(node.shortId);
        }}
        onDragOver={(e) => drag?.hover(e, node.shortId)}
        onDrop={(e) => drag?.drop(e, node.shortId)}
        onDragEnd={() => drag?.end()}
        className={cn(
          'group relative flex items-center gap-1 rounded-md pr-1 text-sm hover:bg-accent',
          active && 'bg-accent font-medium',
          drag?.dragging === node.shortId && 'opacity-50',
          zone === 'inside' && 'ring-2 ring-ring',
          zone === 'before' &&
            'before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:bg-link',
          zone === 'after' &&
            'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-link',
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
          onMouseEnter={titleIfTruncated}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 py-1',
            node.status === 'deprecated' && 'text-muted-foreground line-through',
          )}
        >
          <span className="truncate">{node.title}</span>
          <StatusDot status={node.status} className="ml-auto opacity-0 group-hover:opacity-100" />
        </Link>
        {drag?.enabled && (
          <Link
            to="/s/$key/new"
            params={{ key: spaceKey }}
            search={{ parent: node.id }}
            className="flex size-5 shrink-0 items-center justify-center rounded opacity-0 hover:bg-background group-hover:opacity-100 focus:opacity-100"
            aria-label={t('tree.addChild', { title: node.title })}
          >
            <Plus className="size-3.5" />
          </Link>
        )}
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
