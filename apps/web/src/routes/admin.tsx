import type { Space } from '@clavis/shared/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { cn } from 'cn';
import { Bot, Check, Copy, KeyRound, Pencil, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Notice } from '@/components/notice';
import { SpaceForm } from '@/components/space-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { apiGet, apiSend, isApiError } from '@/lib/api';
import { useMe } from '@/lib/me';
import { spacesQuery } from '@/lib/queries';
import { relativeTime } from '@/lib/time';

export const Route = createFileRoute('/admin')({ component: Admin });

interface AdminActor {
  id: string;
  kind: 'human' | 'agent';
  name: string;
  email: string | null;
  role: 'admin' | 'editor' | 'viewer' | 'pending';
  createdAt: number;
  disabledAt: number | null;
}
interface ApiToken {
  id: string;
  actorId: string;
  prefix: string;
  lastUsedAt: number | null;
  createdAt: number;
  revokedAt: number | null;
}

const TABS = ['people', 'agents', 'spaces'] as const;

function Admin() {
  const { t } = useTranslation();
  const me = useMe();
  const [tab, setTab] = useState<(typeof TABS)[number]>('people');
  if (me.data?.role !== 'admin') return <Notice title={t('admin.only')} />;
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
      <div className="mt-4 flex gap-1 border-b" role="tablist">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'px-3 py-2 text-sm',
              tab === key && 'border-b-2 border-foreground font-medium',
            )}
          >
            {t(`admin.${key}`)}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'people' && <People myId={me.data.id} />}
        {tab === 'agents' && <Agents />}
        {tab === 'spaces' && <Spaces />}
      </div>
    </div>
  );
}

function useActors() {
  return useQuery({
    queryKey: ['admin', 'actors'],
    queryFn: () => apiGet<{ actors: AdminActor[] }>('/admin/actors').then((r) => r.actors),
  });
}

function useUpdateActor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; role?: AdminActor['role']; disabled?: boolean; name?: string }) =>
      apiSend('PATCH', `/admin/actors/${v.id}`, {
        role: v.role,
        disabled: v.disabled,
        name: v.name,
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'actors'] }),
  });
}

function People({ myId }: { myId: string }) {
  const { t, i18n } = useTranslation();
  const actors = useActors();
  const update = useUpdateActor();
  const people = actors.data?.filter((a) => a.kind === 'human') ?? [];
  return (
    <ul className="divide-y rounded-md border">
      {people.map((p) => (
        <li
          key={p.id}
          className={cn(
            'flex flex-wrap items-center gap-3 px-4 py-3',
            p.disabledAt && 'opacity-60',
          )}
        >
          <User className="size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {p.name}{' '}
              {p.role === 'pending' && (
                <span className="ml-1 rounded bg-amber-500/20 px-1.5 text-xs">
                  {t('admin.pending')}
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {p.email} · {relativeTime(p.createdAt, i18n.language)}
            </p>
          </div>
          {p.id === myId ? (
            <span className="text-xs text-muted-foreground">{t('admin.you')}</span>
          ) : (
            <>
              <Select
                value={p.role}
                onChange={(e) =>
                  update.mutate({ id: p.id, role: e.target.value as AdminActor['role'] })
                }
                aria-label={t('admin.role')}
              >
                {(['pending', 'viewer', 'editor', 'admin'] as const).map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => update.mutate({ id: p.id, disabled: !p.disabledAt })}
              >
                {p.disabledAt ? t('admin.enable') : t('admin.disable')}
              </Button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function Agents() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const actors = useActors();
  const update = useUpdateActor();
  const tokens = useQuery({
    queryKey: ['admin', 'tokens'],
    queryFn: () => apiGet<{ tokens: ApiToken[] }>('/admin/tokens').then((r) => r.tokens),
  });
  const [name, setName] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [issued, setIssued] = useState<{ agent: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin'] });

  const create = useMutation({
    mutationFn: () => apiSend<AdminActor>('POST', '/admin/agents', { name: name.trim(), role }),
    onSuccess: () => {
      setName('');
      refresh();
    },
  });
  const issue = useMutation({
    mutationFn: (agent: AdminActor) =>
      apiSend<{ token: string }>('POST', `/admin/agents/${agent.id}/tokens`).then((r) => ({
        agent: agent.name,
        token: r.token,
      })),
    onSuccess: (r) => {
      setCopied(false);
      setIssued(r);
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/admin/tokens/${id}`),
    onSuccess: refresh,
  });

  const agents = actors.data?.filter((a) => a.kind === 'agent') ?? [];
  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.agentName')}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Adam"
            className="w-48"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.role')}
          <Select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}>
            <option value="editor">{t('role.editor')}</option>
            <option value="viewer">{t('role.viewer')}</option>
          </Select>
        </label>
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          {t('admin.addAgent')}
        </Button>
      </form>

      <ul className="divide-y rounded-md border">
        {agents.map((a) => {
          const mine = tokens.data?.filter((tk) => tk.actorId === a.id && !tk.revokedAt) ?? [];
          return (
            <li key={a.id} className={cn('px-4 py-3', a.disabledAt && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-3">
                <Bot className="size-4 text-muted-foreground" />
                {renaming?.id === a.id ? (
                  <form
                    className="flex flex-1 flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const next = renaming.name.trim();
                      if (next && next !== a.name) update.mutate({ id: a.id, name: next });
                      setRenaming(null);
                    }}
                  >
                    <Input
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: a.id, name: e.target.value })}
                      aria-label={t('admin.agentName')}
                      maxLength={64}
                      className="w-48"
                      autoFocus
                    />
                    <Button type="submit" size="sm" disabled={!renaming.name.trim()}>
                      {t('admin.renameSave')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRenaming(null)}
                    >
                      {t('admin.renameCancel')}
                    </Button>
                    <span className="w-full text-xs text-muted-foreground">
                      {t('admin.renameHint')}
                    </span>
                  </form>
                ) : (
                  <span className="flex flex-1 items-center gap-1 font-medium">
                    {a.name}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={t('admin.rename')}
                      onClick={() => setRenaming({ id: a.id, name: a.name })}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </span>
                )}
                <Select
                  value={a.role}
                  onChange={(e) =>
                    update.mutate({ id: a.id, role: e.target.value as AdminActor['role'] })
                  }
                  aria-label={t('admin.role')}
                >
                  <option value="editor">{t('role.editor')}</option>
                  <option value="viewer">{t('role.viewer')}</option>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => issue.mutate(a)}
                  disabled={issue.isPending}
                >
                  <KeyRound /> {t('admin.issueToken')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => update.mutate({ id: a.id, disabled: !a.disabledAt })}
                >
                  {a.disabledAt ? t('admin.enable') : t('admin.disable')}
                </Button>
              </div>
              {mine.length > 0 && (
                <ul className="mt-2 ml-7 flex flex-col gap-1 text-xs text-muted-foreground">
                  {mine.map((tk) => (
                    <li key={tk.id} className="flex items-center gap-3">
                      <code>{tk.prefix}…</code>
                      <span>
                        {tk.lastUsedAt
                          ? t('admin.lastUsed', {
                              when: relativeTime(tk.lastUsedAt, i18n.language),
                            })
                          : t('admin.neverUsed')}
                      </span>
                      <button
                        type="button"
                        className="text-destructive underline"
                        onClick={() => revoke.mutate(tk.id)}
                      >
                        {t('admin.revoke')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={issued !== null} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.tokenTitle', { agent: issued?.agent })}</DialogTitle>
            <DialogDescription>{t('admin.tokenOnce')}</DialogDescription>
          </DialogHeader>
          <code className="block rounded-md border bg-muted p-3 font-mono text-sm break-all">
            {issued?.token}
          </code>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(issued?.token ?? '').then(() => setCopied(true))
              }
            >
              {copied ? <Check /> : <Copy />} {t('admin.copy')}
            </Button>
            <Button onClick={() => setIssued(null)}>{t('admin.done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Spaces() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const spaces = useQuery(spacesQuery(true));
  const [editing, setEditing] = useState<Space | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = useMutation({
    mutationFn: (s: Space) =>
      apiSend('PATCH', `/spaces/${s.key}`, { archived: s.archivedAt === null }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['spaces'] }),
    onError: (e) => setError(isApiError(e) ? e.problem.title : String(e)),
  });
  return (
    <div className="flex flex-col gap-4">
      <Button className="self-start" onClick={() => setEditing('new')}>
        {t('space.new')}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="divide-y rounded-md border">
        {spaces.data?.map((s) => (
          <li
            key={s.key}
            className={cn(
              'flex flex-wrap items-center gap-3 px-4 py-3',
              s.archivedAt && 'opacity-60',
            )}
          >
            <span className="w-16 font-mono text-xs">{s.key}</span>
            <span className="flex-1 font-medium">
              {s.name}{' '}
              {s.archivedAt && <span className="ml-1 text-xs">({t('space.archived')})</span>}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
              {t('page.edit')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toggle.mutate(s)}>
              {s.archivedAt ? t('space.unarchive') : t('space.archive')}
            </Button>
          </li>
        ))}
      </ul>
      <SpaceForm space={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
