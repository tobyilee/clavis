import type { Notification } from '@clavis/shared/schema';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { AtSign, Bell, Bot, FilePen, MessageSquare, User } from 'lucide-react';
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
import { notificationsQuery, useNotificationActions } from '@/lib/notifications';
import { relativeTime } from '@/lib/time';
import { pageParams } from '@/lib/urls';

const ICONS = { 'page.changed': FilePen, comment: MessageSquare, mention: AtSign } as const;

/** The header bell (D-57): unread count, the latest notifications, and a way to them. */
export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const list = useQuery(notificationsQuery);
  const { read, muteAgentEdits } = useNotificationActions();
  const unread = list.data?.unread ?? 0;
  const items = list.data?.notifications ?? [];

  const open = (n: Notification) => {
    if (!n.readAt) read.mutate([n.id]);
    const params = pageParams(n.page);
    if (n.kind === 'page.changed' && n.toRevision) {
      void navigate({
        to: '/s/$key/p/$slugId/history',
        params,
        search: { r: n.toRevision, base: n.fromRevision ?? undefined },
      });
    } else {
      void navigate({ to: '/s/$key/p/$slugId', params, hash: 'comments' });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label={t('notifications.bell', { count: unread })}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="flex items-center gap-2">
          {t('notifications.title')}
          {unread > 0 && (
            <button
              type="button"
              className="ml-auto text-xs font-normal text-muted-foreground underline"
              onClick={() => read.mutate(undefined)}
            >
              {t('notifications.readAll')}
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            {t('notifications.empty')}
          </p>
        )}
        <div className="max-h-96 overflow-y-auto">
          {items.map((n) => (
            <NotificationItem key={n.id} n={n} onSelect={() => open(n)} />
          ))}
        </div>
        <DropdownMenuSeparator />
        <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={list.data?.muteAgentEdits ?? false}
            onChange={(e) => muteAgentEdits.mutate(e.target.checked)}
          />
          {t('notifications.muteAgentEdits')}
        </label>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationItem({ n, onSelect }: { n: Notification; onSelect: () => void }) {
  const { t, i18n } = useTranslation();
  const Icon = ICONS[n.kind];
  const Who = n.actor.kind === 'agent' ? Bot : User;
  return (
    <DropdownMenuItem onSelect={onSelect} className="items-start gap-2 py-2">
      <Icon className={cn('mt-0.5 size-4 shrink-0', !n.readAt && 'text-primary')} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('truncate', !n.readAt && 'font-medium')}>{n.page.title}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Who className="size-3" />
          <span className="truncate">
            {n.actor.name} · {t(`notifications.kind.${n.kind}`, { count: n.count })}
          </span>
          <span className="ml-auto shrink-0">{relativeTime(n.lastAt, i18n.language)}</span>
        </span>
      </span>
      {!n.readAt && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
          <span className="sr-only">{t('notifications.unread')}</span>
        </span>
      )}
    </DropdownMenuItem>
  );
}
