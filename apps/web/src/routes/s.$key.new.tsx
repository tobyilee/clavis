import { DOC_TYPES, type DocType, type SaveResult } from '@clavis/shared/schema';
import { TEMPLATES } from '@clavis/shared/templates';
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
import { pageParams } from '@/lib/urls';

interface NewPageSearch {
  parent?: string;
  template?: DocType;
}

export const Route = createFileRoute('/s/$key/new')({
  validateSearch: (s: Record<string, unknown>): NewPageSearch => ({
    parent: typeof s.parent === 'string' ? s.parent : undefined,
    template: DOC_TYPES.includes(s.template as DocType) ? (s.template as DocType) : undefined,
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
  const [template, setTemplate] = useState<DocType>(search.template ?? 'note');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parent = useQuery({ ...pageQuery(search.parent ?? ''), enabled: !!search.parent });
  const locale = i18n.language.startsWith('ko') ? 'ko' : 'en';

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
          {TEMPLATES.map((tpl) => (
            <label
              key={tpl.type}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm hover:bg-accent',
                template === tpl.type && 'border-foreground bg-accent',
              )}
            >
              <input
                type="radio"
                name="template"
                value={tpl.type}
                checked={template === tpl.type}
                onChange={() => setTemplate(tpl.type)}
                className="sr-only"
              />
              <span className="font-medium">{tpl.name[locale]}</span>
              <span className="text-muted-foreground">{tpl.description[locale]}</span>
              {tpl.sections.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {tpl.sections.map((s) => s[locale]).join(' · ')}
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
