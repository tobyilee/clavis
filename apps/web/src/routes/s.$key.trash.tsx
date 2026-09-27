import type { TrashEntry } from '@clavis/shared/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Bot, RotateCcw, Trash2, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { apiGet, apiSend, isApiError } from '@/lib/api';
import { useCanEdit } from '@/lib/me';
import { absoluteTime, relativeTime } from '@/lib/time';

export const Route = createFileRoute('/s/$key/trash')({ component: Trash });

const RETENTION_DAYS = 30;

function Trash() {
  const { t, i18n } = useTranslation();
  const { key } = Route.useParams();
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [message, setMessage] = useState<string | null>(null);
  const trash = useQuery({
    queryKey: ['trash', key.toUpperCase()],
    queryFn: () =>
      apiGet<{ entries: TrashEntry[] }>(`/trash?space=${encodeURIComponent(key)}`).then(
        (r) => r.entries,
      ),
  });
  const restore = useMutation({
    mutationFn: (batchId: string) =>
      apiSend<{ restored: number; renamed: { title: string }[] }>(
        'POST',
        `/trash/${batchId}/restore`,
      ),
    onSuccess: (r) => {
      setMessage(
        [
          t('trash.restored', { count: r.restored }),
          ...r.renamed.map((x) => t('trash.renamed', { title: x.title })),
        ].join(' '),
      );
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      void queryClient.invalidateQueries({ queryKey: ['tree', key.toUpperCase()] });
    },
    onError: (e) => setMessage(isApiError(e) ? e.problem.title : t('error.load')),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Trash2 className="size-6" /> {t('app.trash')}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('trash.help', { days: RETENTION_DAYS })}
      </p>
      {message && (
        <p className="mt-4 rounded-md border px-3 py-2 text-sm" role="status">
          {message}
        </p>
      )}
      {trash.data?.length === 0 && <p className="mt-8 text-muted-foreground">{t('trash.empty')}</p>}
      <ul className="mt-6 divide-y rounded-md border">
        {trash.data?.map((entry) => {
          const purgeAt = entry.deletedAt + RETENTION_DAYS * 86_400_000;
          const Icon = entry.deletedBy?.kind === 'agent' ? Bot : User;
          return (
            <li key={entry.batchId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{entry.root.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {entry.pageCount > 1 && (
                    <span>{t('trash.withChildren', { count: entry.pageCount - 1 })}</span>
                  )}
                  {entry.deletedBy && (
                    <span className="inline-flex items-center gap-1">
                      <Icon className="size-3" /> {entry.deletedBy.name}
                    </span>
                  )}
                  <time title={absoluteTime(entry.deletedAt, i18n.language)}>
                    {relativeTime(entry.deletedAt, i18n.language)}
                  </time>
                  <span>
                    · {t('trash.purgeAt', { when: relativeTime(purgeAt, i18n.language) })}
                  </span>
                </p>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => restore.mutate(entry.batchId)}
                  disabled={restore.isPending}
                >
                  <RotateCcw /> {t('trash.restore')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <Link to="/s/$key" params={{ key }} className="mt-6 inline-block text-sm underline">
        {t('page.backToSpace')}
      </Link>
    </div>
  );
}
