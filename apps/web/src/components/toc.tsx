import { cn } from 'cn';
import { List } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TocItem } from '@/markdown/plugins';

/** Tracks which heading is at the top of the viewport. */
function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-64px 0px -70% 0px' },
    );
    for (const e of elements) observer.observe(e);
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function TocList({ items, active }: { items: TocItem[]; active: string | null }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((item) => (
        <li key={item.id} className={cn(item.level === 3 && 'pl-3')}>
          <a
            href={`#${item.id}`}
            className={cn(
              'block truncate py-0.5 text-muted-foreground hover:text-foreground',
              active === item.id && 'font-medium text-foreground',
            )}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Desktop: sticky side column. */
export function TocAside({ items }: { items: TocItem[] }) {
  const { t } = useTranslation();
  const active = useActiveHeading(items.map((i) => i.id));
  if (items.length === 0) return null;
  return (
    <nav
      className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto"
      aria-label={t('app.toc')}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('app.toc')}
      </p>
      <TocList items={items} active={active} />
    </nav>
  );
}

/** Mobile and narrow screens: collapsible block above the content (D-06). */
export function TocInline({ items }: { items: TocItem[] }) {
  const { t } = useTranslation();
  if (items.length < 2) return null;
  return (
    <details className="mb-6 rounded-md border px-3 py-2 2xl:hidden">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <List className="size-4" /> {t('app.toc')}
      </summary>
      <div className="mt-2">
        <TocList items={items} active={null} />
      </div>
    </details>
  );
}
