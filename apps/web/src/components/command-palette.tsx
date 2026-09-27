import type { SearchHit, TreeNode } from '@clavis/shared/schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { FileText, Search } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { indexTree, treeQuery } from '@/lib/queries';
import { useCurrentLocation } from '@/lib/route';
import { searchPages } from '@/lib/search';
import { pageParams } from '@/lib/urls';
import { Snippet } from './snippet';

type Item =
  | {
      kind: 'page';
      key: string;
      spaceKey: string;
      node: Pick<TreeNode, 'title' | 'slug' | 'shortId'>;
    }
  | { kind: 'hit'; key: string; hit: SearchHit }
  | { kind: 'all'; key: string };

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return v;
}

/** ⌘K: jump to a page by title (instant, from the cached tree), or search everything. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { spaceKey } = useCurrentLocation();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const query = useDebounced(q.trim(), 200);

  const tree = useQuery({ ...treeQuery(queryClient, spaceKey ?? ''), enabled: open && !!spaceKey });
  const hits = useQuery({
    queryKey: ['palette', query],
    queryFn: () => searchPages({ q: query, limit: 6 }),
    enabled: open && query.length > 0,
    staleTime: 30_000,
  });

  const items = useMemo((): Item[] => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const titles = tree.data
      ? [...indexTree(tree.data.tree).byTitle.values()]
          .filter((n) => n.title.toLowerCase().includes(needle))
          .slice(0, 5)
          .map(
            (node): Item => ({
              kind: 'page',
              key: `p:${node.shortId}`,
              spaceKey: spaceKey ?? '',
              node,
            }),
          )
      : [];
    const seen = new Set(titles.map((i) => (i.kind === 'page' ? i.node.shortId : '')));
    const found = (hits.data?.hits ?? [])
      .filter((h) => !seen.has(h.shortId))
      .map((hit): Item => ({ kind: 'hit', key: `h:${hit.id}`, hit }));
    return [...titles, ...found, { kind: 'all', key: 'all' }];
  }, [q, tree.data, hits.data, spaceKey]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onOpenChange(false);
    if (item.kind === 'page') {
      void navigate({
        to: '/s/$key/p/$slugId',
        params: pageParams({ spaceKey: item.spaceKey, ...item.node }),
      });
    } else if (item.kind === 'hit') {
      void navigate({ to: '/s/$key/p/$slugId', params: pageParams(item.hit) });
    } else {
      void navigate({ to: '/search', search: { q: q.trim() } });
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border bg-popover shadow-xl"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{t('app.search')}</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, items.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  choose(items[active]);
                }
              }}
              placeholder={t('search.palette')}
              className="h-12 flex-1 bg-transparent text-base outline-none"
              role="combobox"
              aria-expanded={items.length > 0}
              aria-controls="palette-results"
              aria-activedescendant={items[active] ? `palette-${items[active].key}` : undefined}
            />
            <kbd className="text-xs text-muted-foreground">Esc</kbd>
          </div>
          {items.length > 0 && (
            <div id="palette-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-1">
              {items.map((item, i) => (
                <div
                  key={item.key}
                  id={`palette-${item.key}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                  onKeyDown={() => {}}
                  className={cn(
                    'flex cursor-pointer flex-col rounded-md px-3 py-2 text-sm',
                    i === active && 'bg-accent',
                  )}
                >
                  {item.kind === 'page' && (
                    <span className="flex items-center gap-2">
                      <FileText className="size-4 text-muted-foreground" /> {item.node.title}
                    </span>
                  )}
                  {item.kind === 'hit' && (
                    <>
                      <span className="flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" /> {item.hit.title}
                        <span className="text-xs text-muted-foreground">{item.hit.spaceKey}</span>
                      </span>
                      <span className="ml-6 line-clamp-1 text-xs text-muted-foreground">
                        <Snippet text={item.hit.snippet} />
                      </span>
                    </>
                  )}
                  {item.kind === 'all' && (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Search className="size-4" /> {t('search.all', { q: q.trim() })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
