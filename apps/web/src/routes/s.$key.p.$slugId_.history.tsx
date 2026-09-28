import { parseSlugId, type Revision } from '@clavis/shared/schema';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { ArrowLeft, Bot, History, RotateCcw, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { apiGet, apiSend, isApiError } from '@/lib/api';
import { lineDiff } from '@/lib/diff';
import { useCanEdit } from '@/lib/me';
import { pageQuery } from '@/lib/queries';
import { absoluteTime, relativeTime } from '@/lib/time';
import { pageParams } from '@/lib/urls';

interface RevisionList {
  revision: number;
  revisions: Revision[];
  nextBefore: number | null;
  historyStart: number | null;
}

export const Route = createFileRoute('/s/$key/p/$slugId_/history')({
  component: HistoryPage,
  // ?r=N shows revision N; ?base=M compares it with M instead of the one before it.
  validateSearch: (search: Record<string, unknown>): { r?: number; base?: number } => {
    const num = (v: unknown) =>
      Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined;
    return { r: num(search.r), base: num(search.base) };
  },
});

const revisionText = (ref: string, n: number) => ({
  queryKey: ['revision', ref, n],
  queryFn: () => apiGet<{ content: string }>(`/pages/${encodeURIComponent(ref)}/revisions/${n}`),
  // A revision's text never changes.
  staleTime: Number.POSITIVE_INFINITY,
});

function HistoryPage() {
  const { t, i18n } = useTranslation();
  const { slugId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const shortId = parseSlugId(slugId) ?? '';
  const page = useQuery({ ...pageQuery(shortId), enabled: !!shortId });
  const history = useInfiniteQuery({
    queryKey: ['revisions', shortId],
    queryFn: ({ pageParam }) =>
      apiGet<RevisionList>(
        `/pages/${encodeURIComponent(shortId)}/revisions${pageParam ? `?before=${pageParam}` : ''}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!shortId,
  });
  const revisions = useMemo(
    () => history.data?.pages.flatMap((p) => p.revisions) ?? [],
    [history.data],
  );
  const historyStart = history.data?.pages.at(-1)?.historyStart ?? null;

  const selected = revisions.find((r) => r.revision === search.r) ?? revisions[0];
  const older = revisions.filter((r) => selected && r.revision < selected.revision);
  const base = search.base ?? older[0]?.revision;
  const after = useQuery({
    ...revisionText(shortId, selected?.revision ?? 0),
    enabled: !!selected,
  });
  const before = useQuery({ ...revisionText(shortId, base ?? 0), enabled: !!base });
  const diff = useMemo(
    () =>
      after.data && (before.data || !base)
        ? lineDiff(before.data?.content ?? '', after.data.content)
        : null,
    [after.data, before.data, base],
  );

  if (isApiError(page.error, 404) || !shortId) return <Notice title={t('page.notFound')} />;
  if (page.isError || history.isError) return <Notice title={t('error.load')} />;
  if (!page.data || !history.data) return null;
  const current = history.data.pages[0]?.revision ?? page.data.revision;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/s/$key/p/$slugId" params={pageParams(page.data)}>
            <ArrowLeft /> {page.data.title}
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <History className="size-5" /> {t('history.title')}
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <ol className="flex flex-col divide-y rounded-md border" aria-label={t('history.list')}>
          {revisions.map((r) => (
            <li key={r.revision}>
              <button
                type="button"
                onClick={() => void navigate({ search: { r: r.revision }, replace: true })}
                aria-current={r.revision === selected?.revision ? 'true' : undefined}
                className={cn(
                  'flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent',
                  r.revision === selected?.revision && 'bg-accent',
                )}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  r{r.revision}
                  {r.revision === current && (
                    <span className="rounded bg-primary/10 px-1.5 text-xs text-primary">
                      {t('history.current')}
                    </span>
                  )}
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {relativeTime(r.at, i18n.language)}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  {r.actor.kind === 'agent' ? (
                    <Bot className="size-3.5" />
                  ) : (
                    <User className="size-3.5" />
                  )}
                  {r.actor.name} · {kindLabel(t, r)}
                </span>
              </button>
            </li>
          ))}
          {history.hasNextPage && (
            <li className="p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => void history.fetchNextPage()}
                disabled={history.isFetchingNextPage}
              >
                {t('history.more')}
              </Button>
            </li>
          )}
          {historyStart !== null && historyStart > 1 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {t('history.start', { revision: historyStart })}
            </li>
          )}
        </ol>

        {selected && (
          <section className="flex min-w-0 flex-col gap-3" aria-label={t('history.changes')}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">r{selected.revision}</span>
              <span className="text-muted-foreground">
                {absoluteTime(selected.at, i18n.language)}
              </span>
              {older.length > 0 && (
                <label className="flex items-center gap-1 text-muted-foreground">
                  {t('history.compareWith')}
                  <Select
                    value={String(base)}
                    onChange={(e) =>
                      void navigate({
                        search: { r: selected.revision, base: Number(e.target.value) },
                        replace: true,
                      })
                    }
                  >
                    {older.map((r) => (
                      <option key={r.revision} value={r.revision}>
                        r{r.revision} · {r.actor.name}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              {diff && (
                <span className="text-xs">
                  <span className="text-green-700 dark:text-green-400">+{diff.added}</span>{' '}
                  <span className="text-red-700 dark:text-red-400">−{diff.removed}</span>
                </span>
              )}
              <RestoreButton
                shortId={shortId}
                revision={selected}
                current={current}
                onRestored={() =>
                  void navigate({ to: '/s/$key/p/$slugId', params: pageParams(page.data) })
                }
              />
            </div>
            {isApiError(after.error, 404) || isApiError(before.error, 404) ? (
              <p className="text-sm text-muted-foreground">{t('history.textMissing')}</p>
            ) : (
              diff && <DiffView diff={diff} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function kindLabel(t: (k: string, o?: Record<string, unknown>) => string, r: Revision) {
  if (r.kind === 'restore') return t('history.kind.restore', { revision: r.restoredFrom });
  return t(`history.kind.${r.kind}`);
}

function DiffView({ diff }: { diff: ReturnType<typeof lineDiff> }) {
  const { t } = useTranslation();
  if (diff.added === 0 && diff.removed === 0) {
    return <p className="text-sm text-muted-foreground">{t('history.noChanges')}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border font-mono text-xs leading-5">
      {diff.rows.map((row, i) =>
        row.kind === 'skip' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own
          <div key={i} className="bg-muted/50 px-3 text-muted-foreground">
            ⋯ {t('history.unchanged', { count: row.count })}
          </div>
        ) : (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own
            key={i}
            data-kind={row.kind}
            className={cn(
              'flex whitespace-pre',
              row.kind === 'add' && 'bg-green-500/15',
              row.kind === 'del' && 'bg-red-500/15',
            )}
          >
            <span className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground">
              {row.a ?? ''}
            </span>
            <span className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground">
              {row.b ?? ''}
            </span>
            <span className="w-4 shrink-0 select-none">
              {row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ''}
            </span>
            <span>{row.text}</span>
          </div>
        ),
      )}
    </div>
  );
}

function RestoreButton(props: {
  shortId: string;
  revision: Revision;
  current: number;
  onRestored: () => void;
}) {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const restore = useMutation({
    mutationFn: () =>
      apiSend(
        'POST',
        `/pages/${encodeURIComponent(props.shortId)}/revisions/${props.revision.revision}/restore`,
        { baseRevision: props.current },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['page'] });
      void queryClient.invalidateQueries({ queryKey: ['revisions', props.shortId] });
      setOpen(false);
      props.onRestored();
    },
  });
  if (!canEdit || props.revision.revision === props.current) return null;
  return (
    <>
      <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpen(true)}>
        <RotateCcw /> {t('history.restore')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('history.restoreTitle', { revision: props.revision.revision })}
            </DialogTitle>
            <DialogDescription>{t('history.restoreBody')}</DialogDescription>
          </DialogHeader>
          {restore.error && (
            <p className="text-sm text-destructive">
              {isApiError(restore.error, 409)
                ? t('history.restoreConflict')
                : isApiError(restore.error, 422)
                  ? t('history.restoreInvalid')
                  : t('error.load')}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('editor.cancel')}
            </Button>
            <Button onClick={() => restore.mutate()} disabled={restore.isPending}>
              {t('history.restore')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
