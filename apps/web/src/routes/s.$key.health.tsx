import type { SpaceHealth } from '@clavis/shared/schema';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Activity, CircleAlert, Info, Link2Off, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Notice } from '@/components/notice';
import { isApiError } from '@/lib/api';
import { healthQuery, useRecheck } from '@/lib/quality';
import { pageParams } from '@/lib/urls';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/s/$key/health')({ component: Health });

const SEVERITY_ICON = { error: CircleAlert, warning: TriangleAlert, info: Info } as const;
const SEVERITY_COLOR = {
  error: 'text-destructive',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-sky-600 dark:text-sky-400',
} as const;

/** "clavis/no-h1" → the translated short rule name. */
const ruleKey = (ruleId: string) => `lintRule.${ruleId.replace(/^clavis\//, '')}`;

function Health() {
  const { t } = useTranslation();
  const { key } = Route.useParams();
  const health = useQuery(healthQuery(key));
  const progress = useRecheck(key, health.data?.stalePages ?? 0);

  if (isApiError(health.error, 404)) return <Notice title={t('space.notFound')} />;
  if (health.isError) return <Notice title={t('error.load')} />;
  const h = health.data;
  if (!h) return null;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Activity className="size-6" /> {t('health.title')}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('health.help')}</p>

      {progress && (
        <p className="mt-4 rounded-md border px-3 py-2 text-sm" role="status">
          {t('health.rechecking', { done: progress.done, total: progress.total })}
        </p>
      )}

      <Summary h={h} />

      {h.rules.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('health.byRule')}</h2>
          <ul className="mt-3 divide-y rounded-md border">
            {h.rules.map((r) => {
              const Icon = SEVERITY_ICON[r.severity];
              return (
                <li key={r.ruleId} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <Icon className={cn('size-4 shrink-0', SEVERITY_COLOR[r.severity])} />
                  <span className="min-w-0 flex-1 truncate">{t(ruleKey(r.ruleId))}</span>
                  <span className="text-muted-foreground">
                    {t('health.rulePages', { count: r.pages })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t('health.pages')}</h2>
        {h.pages.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('health.noIssues')}</p>
        ) : (
          <ul className="mt-3 divide-y rounded-md border">
            {h.pages.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <Link
                  to="/s/$key/p/$slugId"
                  params={pageParams({ spaceKey: h.space, ...p })}
                  className="font-medium hover:underline"
                >
                  {p.title}
                </Link>
                {p.stale && (
                  <span className="ml-2 text-xs text-muted-foreground">{t('health.stale')}</span>
                )}
                <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {p.rules.map((r) => {
                    const Icon = SEVERITY_ICON[r.severity];
                    return (
                      <li key={r.ruleId}>
                        <Link
                          to="/s/$key/p/$slugId/edit"
                          params={pageParams({ spaceKey: h.space, ...p })}
                          search={{ line: r.line }}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <Icon className={cn('size-3.5', SEVERITY_COLOR[r.severity])} />
                          {t(ruleKey(r.ruleId))}
                          {r.count > 1 && <span>×{r.count}</span>}
                          <span className="font-mono text-xs">L{r.line}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Link2Off className="size-5" /> {t('health.brokenLinks')}
        </h2>
        {h.brokenLinks.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('health.noBrokenLinks')}</p>
        ) : (
          <ul className="mt-3 divide-y rounded-md border">
            {h.brokenLinks.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <Link
                  to="/s/$key/p/$slugId"
                  params={pageParams({ spaceKey: h.space, ...p })}
                  className="font-medium hover:underline"
                >
                  {p.title}
                </Link>
                <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                  {p.targets.map((x) => (
                    <code key={`${x.spaceKey}:${x.title}`}>
                      [[{x.spaceKey === h.space ? x.title : `${x.spaceKey}:${x.title}`}]]
                    </code>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link to="/s/$key" params={{ key }} className="mt-8 inline-block text-sm underline">
        {t('page.backToSpace')}
      </Link>
    </div>
  );
}

function Summary({ h }: { h: SpaceHealth }) {
  const { t } = useTranslation();
  const withIssues = h.pages.length;
  const items = [
    { label: t('health.totalPages'), value: h.totalPages },
    { label: t('health.pagesWithIssues'), value: withIssues },
    { label: t('health.errors'), value: h.totals.errors, tone: SEVERITY_COLOR.error },
    { label: t('health.warnings'), value: h.totals.warnings, tone: SEVERITY_COLOR.warning },
    { label: t('health.brokenLinkCount'), value: h.brokenLinks.length },
  ];
  return (
    <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map((i) => (
        <div key={i.label} className="rounded-md border px-3 py-2">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className={cn('text-xl font-semibold', i.value > 0 && i.tone)}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
