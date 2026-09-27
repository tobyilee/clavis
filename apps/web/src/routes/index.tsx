import type { PageListItem } from '@clavis/shared/schema';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { Bot, Clock, History, MessageSquare, Plus, Star, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SpaceForm } from '@/components/space-form';
import { Button } from '@/components/ui/button';
import { homeQuery } from '@/lib/home';
import { useMe } from '@/lib/me';
import { useSpaces } from '@/lib/queries';
import { relativeTime } from '@/lib/time';
import { pageParams } from '@/lib/urls';

export const Route = createFileRoute('/')({ component: HomePage });

function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <Dashboard />
      <SpaceList />
    </div>
  );
}

type Who = 'all' | 'human' | 'agent';

/** Favorites, recently viewed, recent changes and open comments on my pages (P3). */
function Dashboard() {
  const { t } = useTranslation();
  const home = useQuery(homeQuery);
  const [who, setWho] = useState<Who>('all');
  const h = home.data;
  if (!h) return null;
  const changes = h.recentChanges.filter((p) => who === 'all' || p.updatedBy.kind === who);
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {h.openComments.length > 0 && (
        <PageList
          icon={<MessageSquare className="size-4" />}
          title={t('home.openComments')}
          items={h.openComments}
          detail={(p) => t('home.openThreads', { count: p.openThreads ?? 0 })}
        />
      )}
      <PageList
        icon={<Star className="size-4" />}
        title={t('home.favorites')}
        items={h.favorites.slice(0, 10)}
        empty={t('home.noFavorites')}
      />
      <PageList
        icon={<History className="size-4" />}
        title={t('home.recentViews')}
        items={h.recentViews.slice(0, 10)}
        empty={t('home.noViews')}
        at
      />
      <PageList
        icon={<Clock className="size-4" />}
        title={t('home.recentChanges')}
        items={changes.slice(0, 10)}
        empty={t('home.noChanges')}
        author
        action={
          <fieldset className="flex gap-1 text-xs" aria-label={t('home.recentChanges')}>
            {(['all', 'human', 'agent'] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWho(w)}
                aria-pressed={who === w}
                className={cn(
                  'rounded px-2 py-0.5',
                  who === w ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {t(`home.who.${w}`)}
              </button>
            ))}
          </fieldset>
        }
      />
    </div>
  );
}

function PageList({
  icon,
  title,
  items,
  empty,
  action,
  author,
  at,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  items: PageListItem[];
  empty?: string;
  action?: React.ReactNode;
  /** Show who changed it (recent changes). */
  author?: boolean;
  /** Show `at` (e.g. when viewed) instead of the last change. */
  at?: boolean;
  detail?: (p: PageListItem) => string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          {icon} {title}
        </h2>
        {action}
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y rounded-md border">
          {items.map((p) => {
            const Icon = p.updatedBy.kind === 'agent' ? Bot : User;
            return (
              <li key={p.id}>
                <Link
                  to="/s/$key/p/$slugId"
                  params={pageParams(p)}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent"
                >
                  <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                    {p.spaceKey}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {detail ? (
                      detail(p)
                    ) : (
                      <>
                        {author && (
                          <>
                            <Icon
                              className="size-3"
                              aria-label={t(`actorKind.${p.updatedBy.kind}`)}
                            />
                            {p.updatedBy.name} ·
                          </>
                        )}
                        {relativeTime(at && p.at ? p.at : p.updatedAt, i18n.language)}
                      </>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SpaceList() {
  const { t } = useTranslation();
  const spaces = useSpaces();
  const isAdmin = useMe().data?.role === 'admin';
  const [creating, setCreating] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('home.title')}</h1>
        {isAdmin && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> {t('space.new')}
          </Button>
        )}
      </div>
      <SpaceForm space={creating ? 'new' : null} onClose={() => setCreating(false)} />
      {spaces.isError && <p className="mt-4 text-destructive">{t('error.load')}</p>}
      {spaces.data?.length === 0 && <p className="mt-4 text-muted-foreground">{t('home.empty')}</p>}
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {spaces.data?.map((s) => (
          <li key={s.key}>
            <Link
              to="/s/$key"
              params={{ key: s.key }}
              className="flex h-full flex-col rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <span className="flex items-center gap-2">
                <span className="rounded bg-primary px-1.5 py-0.5 font-mono text-xs font-bold text-primary-foreground">
                  {s.key}
                </span>
                <span className="font-semibold">{s.name}</span>
              </span>
              {s.description && (
                <span className="mt-2 text-sm text-muted-foreground">{s.description}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
