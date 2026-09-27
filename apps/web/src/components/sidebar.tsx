import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronsUpDown, FilePlus, LayoutGrid, Settings, Trash2 } from 'lucide-react';
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
import { useCanEdit, useMe } from '@/lib/me';
import { useSpaces } from '@/lib/queries';
import { useCurrentLocation } from '@/lib/route';
import { PageTree } from './page-tree';

function SpaceSwitcher({ spaceKey }: { spaceKey: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const current = spaces.data?.find((s) => s.key === spaceKey);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
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
            <span className="w-12 font-mono text-xs text-muted-foreground">{s.key}</span>
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

export function Sidebar() {
  const { t } = useTranslation();
  const { spaceKey, shortId } = useCurrentLocation();
  const canEdit = useCanEdit();
  const isAdmin = useMe().data?.role === 'admin';
  return (
    <nav className="flex h-full flex-col gap-2 p-3">
      <SpaceSwitcher spaceKey={spaceKey} />
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
            <Link to="/s/$key/trash" params={{ key: spaceKey }}>
              <Trash2 /> {t('app.trash')}
            </Link>
          </Button>
        </div>
      )}
    </nav>
  );
}
