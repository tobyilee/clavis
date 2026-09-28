import { WEBHOOK_EVENTS, type Webhook, type WebhookEvent } from '@clavis/shared/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { Check, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { apiGet, apiSend, isApiError } from '@/lib/api';
import { relativeTime } from '@/lib/time';

const DEFAULT_EVENTS: WebhookEvent[] = ['page.created', 'page.updated', 'comment.created'];

/** A space's Slack channels and webhooks (D-58). Admins only: the URLs are secrets. */
export function WebhookSettings({ spaceKey }: { spaceKey: string }) {
  const { t } = useTranslation();
  const hooks = useQuery({
    queryKey: ['webhooks', spaceKey],
    queryFn: () =>
      apiGet<{ webhooks: Webhook[] }>(`/spaces/${spaceKey}/webhooks`).then((r) => r.webhooks),
  });
  return (
    <div className="mt-6 flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{t('channels.help')}</p>
      {hooks.data?.map((h) => (
        <WebhookCard key={h.id} hook={h} spaceKey={spaceKey} />
      ))}
      <AddWebhook spaceKey={spaceKey} />
    </div>
  );
}

function EventPicker(props: { value: WebhookEvent[]; onChange: (v: WebhookEvent[]) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <legend className="sr-only">{t('channels.events')}</legend>
      {WEBHOOK_EVENTS.map((e) => (
        <label key={e} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={props.value.includes(e)}
            onChange={(ev) =>
              props.onChange(
                ev.target.checked ? [...props.value, e] : props.value.filter((x) => x !== e),
              )
            }
          />
          {t(`channels.event.${e.replace('.', '_')}`)}
        </label>
      ))}
    </fieldset>
  );
}

function AddWebhook({ spaceKey }: { spaceKey: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<'slack' | 'json'>('slack');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(DEFAULT_EVENTS);
  const add = useMutation({
    mutationFn: () =>
      apiSend<Webhook>('POST', `/spaces/${spaceKey}/webhooks`, { kind, url: url.trim(), events }),
    onSuccess: () => {
      setUrl('');
      void queryClient.invalidateQueries({ queryKey: ['webhooks', spaceKey] });
    },
  });
  return (
    <form
      className="flex flex-col gap-3 rounded-md border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <h2 className="font-medium">{t('channels.add')}</h2>
      <div className="flex flex-wrap gap-2">
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as 'slack' | 'json')}
          aria-label={t('channels.kind')}
        >
          <option value="slack">Slack</option>
          <option value="json">{t('channels.json')}</option>
        </Select>
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={kind === 'slack' ? 'https://hooks.slack.com/services/…' : 'https://…'}
          aria-label={t('channels.url')}
          autoComplete="off"
          className="min-w-0 flex-1"
        />
      </div>
      <EventPicker value={events} onChange={setEvents} />
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          type="submit"
          size="sm"
          disabled={!url.trim() || events.length === 0 || add.isPending}
        >
          {t('channels.addButton')}
        </Button>
        {add.isError && (
          <span className="text-sm text-destructive" role="alert">
            {isApiError(add.error)
              ? (add.error.problem.detail ?? add.error.problem.title)
              : t('error.load')}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('channels.secretNote')}</p>
    </form>
  );
}

function WebhookCard({ hook, spaceKey }: { hook: Webhook; spaceKey: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['webhooks', spaceKey] });
  const update = useMutation({
    mutationFn: (patch: { events?: WebhookEvent[]; enabled?: boolean }) =>
      apiSend('PATCH', `/webhooks/${hook.id}`, patch),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => apiSend('DELETE', `/webhooks/${hook.id}`),
    onSettled: refresh,
  });
  const test = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; status: number | null; error: string | null }>(
        'POST',
        `/webhooks/${hook.id}/test`,
      ),
    onSettled: refresh,
  });

  return (
    <section
      className={cn('flex flex-col gap-3 rounded-md border p-4', !hook.enabled && 'opacity-70')}
      aria-label={hook.url}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
          {hook.kind === 'slack' ? 'Slack' : t('channels.json')}
        </span>
        <code className="min-w-0 flex-1 truncate text-sm">{hook.url}</code>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={hook.enabled}
            onChange={(e) => update.mutate({ enabled: e.target.checked })}
          />
          {t('channels.enabled')}
        </label>
        <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
          <Send /> {t('channels.test')}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('channels.delete')}
          onClick={() => {
            if (window.confirm(t('channels.confirmDelete'))) remove.mutate();
          }}
        >
          <Trash2 />
        </Button>
      </div>
      {test.data && (
        <p
          className={cn(
            'text-sm',
            test.data.ok ? 'text-green-700 dark:text-green-400' : 'text-destructive',
          )}
          role="status"
        >
          {test.data.ok
            ? t('channels.testOk')
            : t('channels.testFailed', {
                status: test.data.status ?? '—',
                error: test.data.error ?? '',
              })}
        </p>
      )}
      <EventPicker
        value={hook.events}
        onChange={(events) => events.length > 0 && update.mutate({ events })}
      />
      {hook.secret && (
        <p className="text-xs text-muted-foreground">
          {t('channels.secret')} <code className="select-all">{hook.secret}</code>
        </p>
      )}
      {hook.deliveries.length > 0 && (
        <ul
          className="flex flex-col gap-0.5 text-xs text-muted-foreground"
          aria-label={t('channels.deliveries')}
        >
          {hook.deliveries.slice(0, 5).map((d) => (
            <li key={`${d.at}-${d.attempt}-${d.event}`} className="flex items-center gap-1.5">
              {d.ok ? (
                <Check className="size-3 text-green-600" />
              ) : (
                <X className="size-3 text-destructive" />
              )}
              <span>{relativeTime(d.at, i18n.language)}</span>
              <span>
                ·{' '}
                {d.event === 'ping'
                  ? t('channels.ping')
                  : t(`channels.event.${d.event.replace('.', '_')}`)}
              </span>
              {d.attempt > 1 && <span>· {t('channels.attempt', { n: d.attempt })}</span>}
              {!d.ok && (
                <span className="truncate">
                  · {d.status ?? '—'} {d.error}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
