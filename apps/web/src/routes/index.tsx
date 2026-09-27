import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SpaceForm } from '@/components/space-form';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { useSpaces } from '@/lib/queries';

export const Route = createFileRoute('/')({ component: SpaceList });

function SpaceList() {
  const { t } = useTranslation();
  const spaces = useSpaces();
  const isAdmin = useMe().data?.role === 'admin';
  const [creating, setCreating] = useState(false);
  return (
    <div className="mx-auto max-w-4xl">
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
