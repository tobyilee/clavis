import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted-foreground/40',
  review: 'bg-amber-500',
  approved: 'bg-emerald-500',
  deprecated: 'bg-red-500',
};

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn('inline-block size-1.5 shrink-0 rounded-full', STATUS_COLOR[status], className)}
      title={t(`status.${status}`)}
    />
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge>
      <StatusDot status={status} />
      {t(`status.${status}`)}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const { t } = useTranslation();
  return <Badge className="bg-muted">{t(`docType.${type}`)}</Badge>;
}
