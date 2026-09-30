import { APP_VERSION } from '@clavis/shared/version';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  Activity,
  ChevronsUpDown,
  FilePlus,
  LayoutGrid,
  Settings,
  Settings2,
  Star,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { favoritesQuery } from '@/lib/home';
import { useCanEdit, useMe } from '@/lib/me';
import { useSpaces } from '@/lib/queries';
import { useCurrentLocation } from '@/lib/route';
import { pageParams } from '@/lib/urls';
import { keyColumnWidth } from '@/lib/utils';
import { PageTree } from './page-tree';

function SpaceSwitcher({ spaceKey }: { spaceKey: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const current = spaces.data?.find((s) => s.key === spaceKey);
  const keyWidth = keyColumnWidth(spaces.data?.map((s) => s.key) ?? []);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded border bg-background text-[10px] font-bold text-muted-foreground">
            {(current?.key ?? '·').slice(0, 3)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {current?.name ?? t('space.choose')}
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{t('space.spaces')}</DropdownMenuLabel>
        {spaces.data?.map((s) => (
          <DropdownMenuItem
            key={s.key}
            onSelect={() => void navigate({ to: '/s/$key', params: { key: s.key } })}
          >
            <span
              className="mr-1 shrink-0 font-mono text-xs text-muted-foreground"
              style={{ width: keyWidth }}
            >
              {s.key}
            </span>
            <span className="truncate">{s.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: '/' })}>
          <LayoutGrid /> {t('space.all')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Starred pages from every space, above the tree (P1). Hidden until something is starred. */
function Favorites({ spaceKey, shortId }: { spaceKey: string | null; shortId: string | null }) {
  const { t } = useTranslation();
  const favorites = useQuery(favoritesQuery);
  if (!favorites.data?.length) return null;
  return (
    <section className="border-b pb-2" aria-label={t('home.favorites')}>
      <p className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
        <Star className="size-3" /> {t('home.favorites')}
      </p>
      <ul>
        {favorites.data.slice(0, 8).map((f) => (
          <li key={f.id}>
            <Link
              to="/s/$key/p/$slugId"
              params={pageParams(f)}
              className={
                f.shortId === shortId
                  ? 'flex items-center gap-2 rounded-md bg-accent px-2 py-1 text-sm font-medium'
                  : 'flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent'
              }
            >
              <span className="min-w-0 flex-1 truncate">{f.title}</span>
              {f.spaceKey !== spaceKey && (
                <span className="font-mono text-[10px] text-muted-foreground">{f.spaceKey}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const { spaceKey, shortId } = useCurrentLocation();
  const canEdit = useCanEdit();
  const isAdmin = useMe().data?.role === 'admin';
  return (
    <nav className="flex h-full flex-col gap-2 p-3">
      <SpaceSwitcher spaceKey={spaceKey} />
      <Favorites spaceKey={spaceKey} shortId={shortId} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {spaceKey ? (
          <PageTree spaceKey={spaceKey} activeShortId={shortId} />
        ) : (
          <p className="px-2 py-2 text-xs text-muted-foreground">{t('space.pick')}</p>
        )}
      </div>
      {isAdmin && (
        <Button variant="ghost" size="sm" className="justify-start" asChild>
          <Link to="/admin">
            <Settings /> {t('admin.title')}
          </Link>
        </Button>
      )}
      {spaceKey && (
        <div className="flex flex-col gap-1 border-t pt-2">
          {canEdit && (
            <Button variant="ghost" size="sm" className="justify-start" asChild>
              <Link to="/s/$key/new" params={{ key: spaceKey }}>
                <FilePlus /> {t('app.newPage')}
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" className="justify-start" asChild>
            <Link to="/s/$key/health" params={{ key: spaceKey }}>
              <Activity /> {t('health.title')}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="justify-start" asChild>
            <Link to="/s/$key/settings" params={{ key: spaceKey }}>
              <Settings2 /> {t('settings.nav')}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="justify-start" asChild>
            <Link to="/s/$key/trash" params={{ key: spaceKey }}>
              <Trash2 /> {t('app.trash')}
            </Link>
          </Button>
        </div>
      )}
      <p
        className="px-2 text-[11px] text-muted-foreground"
        title={__APP_COMMIT__ ? `commit ${__APP_COMMIT__}` : undefined}
      >
        Clavis v{APP_VERSION}
      </p>
    </nav>
  );
}
