import { DOC_STATUSES, DOC_TYPES } from '@clavis/shared/schema';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Loader2, Search as SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Snippet } from '@/components/snippet';
import { StatusDot, TypeBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { useSpaces } from '@/lib/queries';
import { searchPages } from '@/lib/search';
import { relativeTime } from '@/lib/time';
import { pageParams } from '@/lib/urls';

interface SearchSearch {
  q?: string;
  /** "뜻으로 찾기": full text and meaning together (Step 4, E4). */
  mode?: 'hybrid';
  space?: string;
  type?: string;
  status?: string;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export const Route = createFileRoute('/search')({
  validateSearch: (s: Record<string, unknown>): SearchSearch => ({
    q: str(s.q),
    mode: s.mode === 'hybrid' ? 'hybrid' : undefined,
    space: str(s.space),
    type: str(s.type),
    status: str(s.status),
  }),
  component: SearchPage,
});

function SearchPage() {
  const { t, i18n } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/search' });
  const spaces = useSpaces();
  const [draft, setDraft] = useState(search.q ?? '');
  const results = useInfiniteQuery({
    queryKey: ['search', search],
    queryFn: ({ pageParam }) => searchPages({ ...search, q: search.q ?? '', cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!search.q,
  });
  const hits = results.data?.pages.flatMap((p) => p.hits) ?? [];
  const byMeaning = search.mode === 'hybrid';
  const fellBack = byMeaning && results.data?.pages[0]?.mode === 'text';
  const set = (patch: Partial<SearchSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <div className="mx-auto max-w-3xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: draft.trim() || undefined });
        }}
        className="flex gap-2"
      >
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('search.placeholder')}
        />
        <Button type="submit" aria-label={t('app.search')}>
          <SearchIcon />
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Select
          value={search.space ?? ''}
          onChange={(e) => set({ space: e.target.value || undefined })}
          aria-label={t('search.space')}
        >
          <option value="">{t('search.allSpaces')}</option>
          {spaces.data?.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          value={search.type ?? ''}
          onChange={(e) => set({ type: e.target.value || undefined })}
          aria-label={t('editor.type')}
        >
          <option value="">{t('search.allTypes')}</option>
          {DOC_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`docType.${type}`)}
            </option>
          ))}
        </Select>
        <Select
          value={search.status ?? ''}
          onChange={(e) => set({ status: e.target.value || undefined })}
          aria-label={t('editor.status')}
        >
          <option value="">{t('search.allStatuses')}</option>
          {DOC_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5" title={t('search.meaningHelp')}>
          <input
            type="checkbox"
            checked={byMeaning}
            onChange={(e) => set({ mode: e.target.checked ? 'hybrid' : undefined })}
          />
          {t('search.meaning')}
        </label>
      </div>

      {fellBack && (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          {t('search.meaningFallback')}
        </p>
      )}
      {!byMeaning && search.q && [...search.q.trim()].length < 3 && (
        <p className="mt-3 text-xs text-muted-foreground">{t('search.shortQuery')}</p>
      )}
      {results.isFetching && !results.isFetchingNextPage && (
        <Loader2 className="mt-6 size-5 animate-spin" />
      )}
      {results.isSuccess && hits.length === 0 && (
        <p className="mt-6 text-muted-foreground">{t('search.none', { q: search.q })}</p>
      )}
      <ul className="mt-6 flex flex-col gap-5">
        {hits.map((h) => (
          <li key={h.id}>
            <Link
              to="/s/$key/p/$slugId"
              params={pageParams(h)}
              hash={h.section?.id}
              className="group block"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold group-hover:underline">{h.title}</span>
                <TypeBadge type={h.docType} />
                <StatusDot status={h.status} />
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {h.spaceKey}
                {h.section && ` › ${h.section.title}`} · {relativeTime(h.updatedAt, i18n.language)}
              </span>
              <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
                <Snippet text={h.snippet} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {results.hasNextPage && (
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => void results.fetchNextPage()}
          disabled={results.isFetchingNextPage}
        >
          {t('search.more')}
        </Button>
      )}
    </div>
  );
}
