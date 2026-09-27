import { pageSlugId, parseSlugId } from '@clavis/shared/schema';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Navigate } from '@tanstack/react-router';
import { ChevronRight, FileQuestion } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Notice } from '@/components/notice';
import { Author, PageMeta } from '@/components/page-meta';
import { TocAside, TocInline } from '@/components/toc';
import { isApiError } from '@/lib/api';
import { pageQuery, spaceQuery } from '@/lib/queries';
import { pageParams } from '@/lib/urls';
import { renderMarkdown } from '@/markdown/render';
import { useRenderContext } from '@/markdown/use-render-context';

export const Route = createFileRoute('/s/$key/p/$slugId')({ component: PageView });

function PageView() {
  const { t } = useTranslation();
  const { key, slugId } = Route.useParams();
  const shortId = parseSlugId(slugId);
  const page = useQuery({ ...pageQuery(shortId ?? ''), enabled: !!shortId });
  const space = useQuery(spaceQuery(key));
  const ctx = useRenderContext(key);
  const rendered = useMemo(
    () => (page.data ? renderMarkdown(page.data.content, ctx) : null),
    [page.data, ctx],
  );

  if (!shortId || isApiError(page.error, 404)) {
    return (
      <Notice icon={<FileQuestion className="size-5" />} title={t('page.notFound')}>
        <Link to="/s/$key" params={{ key }} className="text-sm underline">
          {t('page.backToSpace')}
        </Link>
      </Notice>
    );
  }
  if (page.isError) return <Notice title={t('error.load')} />;
  if (!page.data || !rendered) return null;

  const p = page.data;
  // The slug is decoration (D-08): an old or edited slug redirects to the canonical URL.
  if (p.spaceKey !== key || pageSlugId(p.slug, p.shortId) !== slugId) {
    return <Navigate to="/s/$key/p/$slugId" params={pageParams(p)} replace />;
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-10">
      <article className="min-w-0 flex-1">
        <nav
          aria-label="Breadcrumb"
          className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        >
          <Link to="/s/$key" params={{ key: p.spaceKey }} className="hover:text-foreground">
            {space.data?.name ?? p.spaceKey}
          </Link>
          {p.ancestors.map((a) => (
            <span key={a.id} className="flex items-center gap-1">
              <ChevronRight className="size-3.5" />
              <Link
                to="/s/$key/p/$slugId"
                params={pageParams({ spaceKey: p.spaceKey, ...a })}
                className="hover:text-foreground"
              >
                {a.title}
              </Link>
            </span>
          ))}
        </nav>
        <header className="mb-8 border-b pb-5">
          <h1 className="text-3xl font-bold tracking-tight break-words">{p.title}</h1>
          <PageMeta page={p} />
          <div className="mt-3">
            <Author page={p} />
          </div>
        </header>
        <TocInline items={rendered.toc} />
        <div className="prose-clavis">{rendered.element}</div>
      </article>
      <aside className="hidden w-56 shrink-0 xl:block">
        <TocAside items={rendered.toc} />
      </aside>
    </div>
  );
}
