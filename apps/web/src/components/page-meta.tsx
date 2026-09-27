import type { Page } from '@clavis/shared/schema';
import { Bot, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { absoluteTime, relativeTime } from '@/lib/time';
import { Badge, StatusBadge, TypeBadge } from './status';

/** "🤖 hermes · 3분 전" — agents and people are told apart at a glance (00-concept §6). */
export function Author({ page }: { page: Page }) {
  const { i18n, t } = useTranslation();
  const Icon = page.updatedBy.kind === 'agent' ? Bot : User;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon className="size-4" aria-label={t(`actorKind.${page.updatedBy.kind}`)} />
      <span className="font-medium text-foreground">{page.updatedBy.name}</span>
      <span>·</span>
      <time
        dateTime={new Date(page.updatedAt).toISOString()}
        title={absoluteTime(page.updatedAt, i18n.language)}
      >
        {relativeTime(page.updatedAt, i18n.language)}
      </time>
    </span>
  );
}

export function PageMeta({ page }: { page: Page }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <TypeBadge type={page.docType} />
      <StatusBadge status={page.status} />
      {page.owner && (
        <Badge>
          {t('page.owner')}: {page.owner}
        </Badge>
      )}
      {page.tags.map((tag) => (
        <Badge key={tag} className="text-muted-foreground">
          #{tag}
        </Badge>
      ))}
    </div>
  );
}
