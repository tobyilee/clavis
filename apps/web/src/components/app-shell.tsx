import { Link, useRouterState } from '@tanstack/react-router';
import { Menu, Search } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { LANGUAGES } from '@/i18n';
import { useMe } from '@/lib/me';
import { formatSiteTitle, useSite } from '@/lib/site';
import { cn } from '@/lib/utils';
import { CommandPalette } from './command-palette';
import { NotificationBell } from './notification-bell';
import { ResizableAside } from './resizable-aside';
import { Sidebar } from './sidebar';
import { UserMenu } from './user-menu';

function LanguageToggle() {
  const { i18n } = useTranslation();
  return (
    // On phones the account menu holds it, leaving the header room for the site title.
    <div className="hidden rounded-md border text-xs sm:flex">
      {LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => void i18n.changeLanguage(lng)}
          className={cn(
            'px-2 py-1 uppercase',
            i18n.resolvedLanguage === lng && 'bg-accent font-semibold',
          )}
        >
          {lng}
        </button>
      ))}
    </div>
  );
}

/** Approved people and agents only: a pending account cannot read notifications. */
function Bell() {
  const { data } = useMe();
  return data && data.role !== 'pending' ? <NotificationBell /> : null;
}

/** "Clavis - {title}" in the header and the browser tab (D-64); a long title is cut short. */
function SiteTitle() {
  const title = useSite().data;
  const full = formatSiteTitle(title);
  useEffect(() => {
    document.title = full;
  }, [full]);
  return (
    <Link to="/" className="min-w-0 truncate tracking-tight" title={full}>
      <span className="font-semibold">Clavis</span>
      {title && ` - ${title}`}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The mobile drawer closes once a link in it has navigated.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on navigation
  useEffect(() => setMenuOpen(false), [pathname]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur sm:gap-3">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 pt-8">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar />
          </SheetContent>
        </Sheet>
        <SiteTitle />
        {/* An icon on phones, so the site title keeps the room. */}
        <button
          type="button"
          className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-md border text-sm text-muted-foreground hover:bg-accent sm:w-full sm:max-w-72 sm:shrink sm:justify-start sm:px-3"
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 text-left max-sm:sr-only">{t('app.search')}</span>
          <kbd className="hidden text-xs sm:inline">⌘K</kbd>
        </button>
        <LanguageToggle />
        <Bell />
        <UserMenu />
      </header>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <div className="flex flex-1">
        <ResizableAside>
          <Sidebar />
        </ResizableAside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
