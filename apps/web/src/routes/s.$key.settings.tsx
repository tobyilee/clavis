import { DEFAULT_RULES } from '@clavis/shared/lint';
import {
  CONFIGURABLE_RULES,
  type ConfigurableRule,
  DOC_TYPES,
  type DocType,
  type LintConfig,
  RULE_LEVELS,
  type RuleLevel,
  type Space,
  type Template,
  type Violation,
} from '@clavis/shared/schema';
import { TEMPLATES } from '@clavis/shared/templates';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { WebhookSettings } from '@/components/webhook-settings';
import { useViolationMessage } from '@/editor/use-lint';
import { apiSend, isApiError } from '@/lib/api';
import { useCanEdit, useMe } from '@/lib/me';
import { spaceQuery } from '@/lib/queries';
import { templatesQuery } from '@/lib/templates';

type Tab = 'rules' | 'templates' | 'channels';

export const Route = createFileRoute('/s/$key/settings')({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } =>
    s.tab === 'templates' || s.tab === 'channels' ? { tab: s.tab } : {},
  component: Settings,
});

function Settings() {
  const { t } = useTranslation();
  const { key } = Route.useParams();
  const { tab = 'rules' } = Route.useSearch();
  const space = useQuery(spaceQuery(key));
  const isAdmin = useMe().data?.role === 'admin';
  if (space.isError) return <Notice title={t('space.notFound')} />;
  if (!space.data) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Settings2 className="size-6" /> {t('settings.title', { name: space.data.name })}
      </h1>
      <nav className="mt-4 flex gap-1 border-b" aria-label={t('settings.title', { name: '' })}>
        {(isAdmin
          ? (['rules', 'templates', 'channels'] as const)
          : (['rules', 'templates'] as const)
        ).map((id) => (
          <Link
            key={id}
            to="/s/$key/settings"
            params={{ key }}
            search={id === 'rules' ? {} : { tab: id }}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === id
                ? 'border-tab-selected font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`settings.${id}`)}
          </Link>
        ))}
      </nav>
      {tab === 'rules' && <RulesForm space={space.data} />}
      {tab === 'templates' && <Templates spaceKey={space.data.key} />}
      {tab === 'channels' && isAdmin && <WebhookSettings spaceKey={space.data.key} />}
    </div>
  );
}

// ── Rules (D-47) ─────────────────────────────────────────────────────────────

const DEFAULT_SEVERITY = new Map(DEFAULT_RULES.map((r) => [r.id, r.severity]));
const DEFAULT_DOC_KB = 50;

/** One section per line: "배경" or "결정 | Decision" (the second name also counts). */
const sectionsToText = (list: readonly { ko: string; en?: string }[]) =>
  list.map((s) => (s.en && s.en !== s.ko ? `${s.ko} | ${s.en}` : s.ko)).join('\n');
const textToSections = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [ko = '', en] = l.split('|').map((x) => x.trim());
      return en ? { ko, en } : { ko };
    });

function RulesForm({ space }: { space: Space }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isAdmin = useMe().data?.role === 'admin';
  const cfg = space.lintConfig;
  const [rules, setRules] = useState<Partial<Record<ConfigurableRule, RuleLevel>>>(cfg.rules);
  const [sections, setSections] = useState<Partial<Record<DocType, string>>>(() =>
    Object.fromEntries(
      Object.entries(cfg.requiredSections).map(([type, list]) => [type, sectionsToText(list)]),
    ),
  );
  const [docKb, setDocKb] = useState(cfg.docLengthKb ? String(cfg.docLengthKb) : '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const config: LintConfig = {
        rules,
        requiredSections: Object.fromEntries(
          Object.entries(sections).map(([type, text]) => [type, textToSections(text ?? '')]),
        ),
        ...(docKb ? { docLengthKb: Number(docKb) } : {}),
      };
      return apiSend<Space>('PUT', `/spaces/${space.key}/lint-config`, config);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(spaceQuery(space.key).queryKey, updated);
      void queryClient.invalidateQueries({ queryKey: ['health', space.key] });
      void queryClient.invalidateQueries({ queryKey: ['templates', space.key] });
      setMessage({ ok: true, text: t('settings.saved') });
    },
    onError: (e) =>
      setMessage({
        ok: false,
        text: isApiError(e) ? (e.problem.detail ?? e.problem.title) : t('error.load'),
      }),
  });
  const raised = CONFIGURABLE_RULES.filter(
    (id) => rules[id] === 'error' && DEFAULT_SEVERITY.get(id) !== 'error',
  );

  return (
    <form
      className="mt-6 space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        save.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        {t(isAdmin ? 'settings.rulesHelp' : 'settings.rulesReadOnly')}
      </p>
      <fieldset disabled={!isAdmin} className="space-y-2">
        <legend className="mb-2 font-semibold">{t('settings.levels')}</legend>
        <div className="divide-y rounded-md border">
          <div className="flex items-center gap-3 px-4 py-2 text-sm text-muted-foreground">
            <span className="flex-1">{t('lintRule.frontmatter-required')}</span>
            <span>{t('settings.fixedError')}</span>
          </div>
          {CONFIGURABLE_RULES.map((id) => {
            const def = DEFAULT_SEVERITY.get(id) ?? 'info';
            const short = id.replace(/^clavis\//, '');
            return (
              <label key={id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="flex-1">{t(`lintRule.${short}`)}</span>
                <Select
                  value={rules[id] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value as RuleLevel | '';
                    setRules(({ [id]: _, ...rest }) => (v ? { ...rest, [id]: v } : rest));
                  }}
                  aria-label={t(`lintRule.${short}`)}
                >
                  <option value="">
                    {t('settings.default', { level: t(`settings.levelShort.${def}`) })}
                  </option>
                  {RULE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {t(`settings.level.${level}`)}
                    </option>
                  ))}
                </Select>
              </label>
            );
          })}
        </div>
        {raised.length > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400" role="note">
            {t('settings.raisedWarning')}
          </p>
        )}
      </fieldset>

      <fieldset disabled={!isAdmin} className="space-y-3">
        <legend className="mb-1 font-semibold">{t('settings.sections')}</legend>
        <p className="text-sm text-muted-foreground">{t('settings.sectionsHelp')}</p>
        {DOC_TYPES.map((type) => {
          const custom = sections[type] !== undefined;
          const builtin = TEMPLATES.find((tpl) => tpl.type === type)?.sections ?? [];
          return (
            <div key={type} className="rounded-md border px-4 py-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={custom}
                  onChange={(e) =>
                    setSections(({ [type]: _, ...rest }) =>
                      e.target.checked ? { ...rest, [type]: sectionsToText(builtin) } : rest,
                    )
                  }
                />
                <span className="font-medium">{t(`docType.${type}`)}</span>
                {!custom && (
                  <span className="text-muted-foreground">
                    {builtin.length
                      ? builtin.map((s) => s.ko).join(' · ')
                      : t('settings.noSections')}
                  </span>
                )}
              </label>
              {custom && (
                <Textarea
                  className="mt-2 font-mono"
                  rows={Math.max(3, (sections[type] ?? '').split('\n').length + 1)}
                  value={sections[type]}
                  onChange={(e) => setSections((s) => ({ ...s, [type]: e.target.value }))}
                  aria-label={t('settings.sectionsFor', { type: t(`docType.${type}`) })}
                  placeholder={t('settings.sectionsPlaceholder')}
                />
              )}
            </div>
          );
        })}
      </fieldset>

      <fieldset disabled={!isAdmin}>
        <label className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold">{t('settings.docLength')}</span>
          <Input
            type="number"
            min={5}
            max={100}
            className="w-24"
            value={docKb}
            placeholder={String(DEFAULT_DOC_KB)}
            onChange={(e) => setDocKb(e.target.value)}
          />
          <span className="text-muted-foreground">KB</span>
        </label>
      </fieldset>

      {isAdmin && (
        <div className="flex items-center gap-3">
          <Button variant="primary" type="submit" disabled={save.isPending}>
            {t('settings.save')}
          </Button>
          {message && (
            <p
              className={cn('text-sm', message.ok ? 'text-muted-foreground' : 'text-destructive')}
              role="status"
            >
              {message.text}{' '}
              {message.ok && (
                <Link to="/s/$key/health" params={{ key: space.key }} className="underline">
                  {t('settings.openHealth')}
                </Link>
              )}
            </p>
          )}
        </div>
      )}
    </form>
  );
}

// ── Templates (D-49) ─────────────────────────────────────────────────────────

const PLACEHOLDERS = { title: '{{title}}', owner: '{{owner}}', date: '{{date}}' };

const PLACEHOLDER_TEMPLATE = `---
type: meeting
status: draft
owner: {{owner}}
tags: []
---
`;

function Templates({ spaceKey }: { spaceKey: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ko') ? 'ko' : 'en';
  const canEdit = useCanEdit();
  const isAdmin = useMe().data?.role === 'admin';
  const templates = useQuery(templatesQuery(spaceKey, locale));
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const custom = templates.data?.filter((tpl) => tpl.scope !== 'builtin') ?? [];
  const builtins = templates.data?.filter((tpl) => tpl.scope === 'builtin') ?? [];

  if (editing) {
    return (
      <TemplateForm
        spaceKey={spaceKey}
        template={editing === 'new' ? null : editing}
        builtins={builtins}
        onDone={() => setEditing(null)}
      />
    );
  }
  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-muted-foreground">{t('templates.help')}</p>
      {custom.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('templates.none')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {custom.map((tpl) => {
            const editable = canEdit && (tpl.scope === 'space' || isAdmin);
            return (
              <li key={tpl.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {tpl.name}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      {t(`templates.scope.${tpl.scope}`)} · {t(`docType.${tpl.type}`)}
                    </span>
                  </p>
                  {tpl.description && (
                    <p className="truncate text-muted-foreground">{tpl.description}</p>
                  )}
                </div>
                {editable && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(tpl)}>
                    {t('templates.edit')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && <Button onClick={() => setEditing('new')}>{t('templates.new')}</Button>}
    </div>
  );
}

function TemplateForm({
  spaceKey,
  template,
  builtins,
  onDone,
}: {
  spaceKey: string;
  template: Template | null;
  builtins: Template[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const message = useViolationMessage();
  const isAdmin = useMe().data?.role === 'admin';
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [everySpace, setEverySpace] = useState(template?.scope === 'global');
  const [content, setContent] = useState(template?.content ?? PLACEHOLDER_TEMPLATE);
  const [problems, setProblems] = useState<Violation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['templates'] });
    onDone();
  };
  const save = useMutation({
    mutationFn: () =>
      template
        ? apiSend('PUT', `/templates/${template.id}`, { name, description, content })
        : apiSend('POST', '/templates', {
            space: everySpace ? null : spaceKey,
            name,
            description,
            content,
          }),
    onSuccess: done,
    onError: (e) => {
      setProblems(isApiError(e) ? (e.problem.violations ?? []) : []);
      setError(isApiError(e) ? e.problem.title : t('error.load'));
    },
  });
  const remove = useMutation({
    mutationFn: () => apiSend('DELETE', `/templates/${template?.id}`),
    onSuccess: done,
  });

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setProblems([]);
        setError(null);
        save.mutate();
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('templates.name')}</span>
        <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('templates.description')}</span>
        <Input
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {!template && isAdmin && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={everySpace}
            onChange={(e) => setEverySpace(e.target.checked)}
          />
          {t('templates.everySpace')}
        </label>
      )}
      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{t('templates.content')}</span>
          <Select
            value=""
            onChange={(e) => {
              const from = builtins.find((b) => b.id === e.target.value);
              if (from) setContent(from.content.replace(/^owner: .*$/m, 'owner: {{owner}}'));
            }}
            aria-label={t('templates.startFrom')}
          >
            <option value="">{t('templates.startFrom')}</option>
            {builtins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <Textarea
          className="font-mono"
          rows={18}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-label={t('templates.content')}
        />
        <p className="text-muted-foreground">
          {/* The placeholders are literal text here, not i18next variables. */}
          {t('templates.placeholders', PLACEHOLDERS)}
        </p>
      </div>
      {error && (
        <div className="rounded-md border border-destructive/40 px-3 py-2 text-sm" role="alert">
          <p className="text-destructive">{error}</p>
          {problems.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {problems.map((v) => (
                <li key={`${v.ruleId}:${v.line}`}>
                  L{v.line} {message(v)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" type="submit" disabled={save.isPending || !name.trim()}>
          {t('templates.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('comments.cancel')}
        </Button>
        {template && (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(t('templates.confirmDelete', { name: template.name }))) {
                remove.mutate();
              }
            }}
          >
            {t('templates.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}
