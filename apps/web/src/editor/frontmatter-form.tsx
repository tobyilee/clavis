import { DOC_STATUSES, DOC_TYPES } from '@clavis/shared/schema';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Select } from '@/components/ui/input';
import type { FrontmatterFields } from './frontmatter';

/** Form view over the YAML frontmatter (D-10); every change rewrites the YAML in the editor. */
export function FrontmatterForm({
  fields,
  valid,
  onChange,
}: {
  fields: FrontmatterFields;
  valid: boolean;
  onChange: (patch: Partial<FrontmatterFields>) => void;
}) {
  const { t } = useTranslation();
  const [tagDraft, setTagDraft] = useState('');
  if (!valid) {
    return <p className="text-sm text-destructive">{t('editor.yamlBroken')}</p>;
  }
  const addTag = () => {
    const tag = tagDraft.trim().replace(/^#/, '');
    if (tag && !fields.tags.includes(tag)) onChange({ tags: [...fields.tags, tag] });
    setTagDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">{t('editor.type')}</span>
        <Select value={fields.type} onChange={(e) => onChange({ type: e.target.value })}>
          {!DOC_TYPES.includes(fields.type as never) && (
            <option value={fields.type}>{fields.type || '—'}</option>
          )}
          {DOC_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`docType.${type}`)}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">{t('editor.status')}</span>
        <Select value={fields.status} onChange={(e) => onChange({ status: e.target.value })}>
          {!DOC_STATUSES.includes(fields.status as never) && (
            <option value={fields.status}>{fields.status || '—'}</option>
          )}
          {DOC_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">{t('page.owner')}</span>
        <Input
          className="w-44"
          value={fields.owner}
          onChange={(e) => onChange({ owner: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-1">
        {fields.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs"
          >
            #{tag}
            <button
              type="button"
              aria-label={t('editor.removeTag', { tag })}
              onClick={() => onChange({ tags: fields.tags.filter((x) => x !== tag) })}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Input
          className="h-7 w-28 text-xs pointer-coarse:h-9"
          placeholder={t('editor.addTag')}
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
        />
      </div>
    </div>
  );
}
