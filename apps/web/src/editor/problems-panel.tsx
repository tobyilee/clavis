import type { Violation } from '@clavis/shared/schema';
import { cn } from 'cn';
import { ChevronDown, CircleX, Info, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export const SEVERITY_ICON = {
  error: <CircleX className="size-4 shrink-0 text-destructive" />,
  warning: <TriangleAlert className="size-4 shrink-0 text-amber-500" />,
  info: <Info className="size-4 shrink-0 text-sky-500" />,
};

export function ProblemsPanel({
  violations,
  messageFor,
  onSelect,
}: {
  violations: Violation[];
  messageFor: (v: Violation) => string;
  onSelect: (line: number) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const count = (s: Violation['severity']) => violations.filter((v) => v.severity === s).length;
  const errors = count('error');
  return (
    <section className="border-t bg-muted/30" aria-label={t('editor.problems')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-1.5 text-xs"
        aria-expanded={open}
      >
        <span className="font-semibold">{t('editor.problems')}</span>
        <span
          className={cn('flex items-center gap-1', errors > 0 && 'font-semibold text-destructive')}
        >
          {SEVERITY_ICON.error} {errors}
        </span>
        <span className="flex items-center gap-1">
          {SEVERITY_ICON.warning} {count('warning')}
        </span>
        <span className="flex items-center gap-1">
          {SEVERITY_ICON.info} {count('info')}
        </span>
        {errors > 0 && <span className="text-destructive">{t('editor.errorsBlock')}</span>}
        <ChevronDown className={cn('ml-auto size-4 transition-transform', !open && 'rotate-180')} />
      </button>
      {open && violations.length > 0 && (
        <ProblemList
          violations={violations}
          messageFor={messageFor}
          onSelect={onSelect}
          className="max-h-36"
        />
      )}
    </section>
  );
}

/** The problems, each a button that jumps to its line. */
export function ProblemList({
  violations,
  messageFor,
  onSelect,
  className,
}: {
  violations: Violation[];
  messageFor: (v: Violation) => string;
  onSelect: (line: number) => void;
  className?: string;
}) {
  return (
    <ul className={cn('overflow-y-auto px-2 pb-2 text-sm', className)}>
      {violations.map((v) => (
        <li key={`${v.ruleId}:${v.line}:${v.column ?? 0}:${v.message}`}>
          <button
            type="button"
            onClick={() => onSelect(v.line)}
            className="flex w-full items-start gap-2 rounded px-2 py-1 text-left hover:bg-accent"
          >
            {SEVERITY_ICON[v.severity]}
            <span className="w-10 shrink-0 font-mono text-xs leading-5 text-muted-foreground">
              L{v.line}
            </span>
            <span className="min-w-0 flex-1">{messageFor(v)}</span>
            <span className="hidden shrink-0 font-mono text-xs leading-5 text-muted-foreground sm:inline">
              {v.ruleId}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
