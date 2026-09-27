import type { SaveResult } from '@clavis/shared/schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiSend, isApiError } from '@/lib/api';
import { useCanEdit } from '@/lib/me';
import { pageQuery } from '@/lib/queries';
import { templatesQuery } from '@/lib/templates';
import { pageParams } from '@/lib/urls';

interface NewPageSearch {
  parent?: string;
  /** A document type or a custom template id. */
  template?: string;
}

export const Route = createFileRoute('/s/$key/new')({
  validateSearch: (s: Record<string, unknown>): NewPageSearch => ({
    parent: typeof s.parent === 'string' ? s.parent : undefined,
    template: typeof s.template === 'string' ? s.template : undefined,
  }),
  component: NewPage,
});

/** Pick a template, name the page, and continue in the editor (plan E7). */
function NewPage() {
  const { t, i18n } = useTranslation();
  const { key } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<string>(search.template ?? 'note');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parent = useQuery({ ...pageQuery(search.parent ?? ''), enabled: !!search.parent });
  const locale = i18n.language.startsWith('ko') ? 'ko' : 'en';
  const templates = useQuery(templatesQuery(key, locale));

  if (!canEdit) return <Notice title={t('editor.readOnly')} />;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiSend<SaveResult>('POST', `/spaces/${key}/pages`, {
        title: title.trim(),
        template,
        parent: search.parent ?? null,
      });
      void queryClient.invalidateQueries({ queryKey: ['tree', result.page.spaceKey] });
      await navigate({ to: '/s/$key/p/$slugId/edit', params: pageParams(result.page) });
    } catch (err) {
      setError(
        isApiError(err) ? (err.problem.detail ?? err.problem.title) : t('editor.saveFailed'),
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={create} className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t('newPage.heading')}</h1>
        {parent.data && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t('newPage.under', { parent: parent.data.title })}
          </p>
        )}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t('editor.title')}</span>
        <Input
          autoFocus
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">{t('newPage.template')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {templates.data?.map((tpl) => (
            <label
              key={tpl.id}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm hover:bg-accent',
                template === tpl.id && 'border-foreground bg-accent',
              )}
            >
              <input
                type="radio"
                name="template"
                value={tpl.id}
                checked={template === tpl.id}
                onChange={() => setTemplate(tpl.id)}
                className="sr-only"
              />
              <span className="flex items-center gap-2 font-medium">
                {tpl.name}
                {tpl.scope !== 'builtin' && (
                  <span className="rounded border px-1.5 text-[10px] font-normal text-muted-foreground">
                    {t(`templates.scope.${tpl.scope}`)}
                  </span>
                )}
              </span>
              {tpl.description && <span className="text-muted-foreground">{tpl.description}</span>}
              {tpl.requiredSections.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {tpl.requiredSections.join(' · ')}
                </span>
              )}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => window.history.back()}>
          {t('editor.cancel')}
        </Button>
        <Button type="submit" disabled={busy || !title.trim()}>
          {busy && <Loader2 className="animate-spin" />}
          {t('newPage.create')}
        </Button>
      </div>
    </form>
  );
}
