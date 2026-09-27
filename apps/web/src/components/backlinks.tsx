import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CornerDownRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { backlinksQuery } from '@/lib/quality';
import { pageParams } from '@/lib/urls';

/** Pages linking here with [[wiki links]], from any space. Hidden when there are none. */
export function Backlinks({ pageId, spaceKey }: { pageId: string; spaceKey: string }) {
  const { t } = useTranslation();
  const links = useQuery(backlinksQuery(pageId));
  if (!links.data?.length) return null;
  return (
    <section className="mt-10 border-t pt-5" aria-labelledby="backlinks-heading">
      <h2 id="backlinks-heading" className="text-sm font-semibold text-muted-foreground">
        {t('page.backlinks', { count: links.data.length })}
      </h2>
      <ul className="mt-2 space-y-1 text-sm">
        {links.data.map((b) => (
          <li key={b.id}>
            <Link
              to="/s/$key/p/$slugId"
              params={pageParams(b)}
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              <CornerDownRight className="size-3.5 text-muted-foreground" />
              {b.spaceKey !== spaceKey && (
                <span className="font-mono text-xs text-muted-foreground">{b.spaceKey}</span>
              )}
              {b.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
