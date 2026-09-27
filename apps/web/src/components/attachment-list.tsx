import type { Attachment } from '@clavis/shared/schema';
import { Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { relativeTime } from '@/lib/time';

const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  const { t, i18n } = useTranslation();
  if (attachments.length === 0) return null;
  return (
    <details className="mt-10 rounded-md border px-4 py-2 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <Paperclip className="size-4" /> {t('attachments.title', { count: attachments.length })}
      </summary>
      <ul className="mt-2 divide-y">
        {attachments.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
            <a
              href={a.url}
              target="_blank"
              rel="noopener"
              className="min-w-0 truncate font-mono text-xs underline"
            >
              {a.filename}
            </a>
            <span className="text-xs text-muted-foreground">{size(a.sizeBytes)}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {a.createdBy.name} · {relativeTime(a.createdAt, i18n.language)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
