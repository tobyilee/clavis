import { Link, useRouterState } from '@tanstack/react-router';
import { Menu, Search } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { LANGUAGES } from '@/i18n';
import { useMe } from '@/lib/me';
import { cn } from '@/lib/utils';
import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';

function LanguageToggle() {
  const { i18n } = useTranslation();
  return (
    <div className="flex rounded-md border text-xs">
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

function CurrentUser() {
  const { t } = useTranslation();
  const { data } = useMe();
  if (!data) return null;
  return (
    <>
      {data.role === 'admin' && (
        <Link
          to="/admin"
          className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline"
        >
          {t('admin.title')}
        </Link>
      )}
      <span
        className="hidden max-w-40 truncate text-xs text-muted-foreground sm:inline"
        title={data.email ?? ''}
      >
        {data.name}
      </span>
    </>
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
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
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
        <Link to="/" className="font-semibold tracking-tight">
          Clavis
        </Link>
        <button
          type="button"
          className="ml-auto flex h-9 w-full max-w-72 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground hover:bg-accent"
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">{t('app.search')}</span>
          <kbd className="hidden text-xs sm:inline">⌘K</kbd>
        </button>
        <LanguageToggle />
        <CurrentUser />
      </header>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 border-r bg-sidebar md:block">
          <Sidebar />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
