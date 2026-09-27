import type { Element } from 'hast';
import { MessageSquare } from 'lucide-react';
import { createContext, createElement, useContext } from 'react';
import { useTranslation } from 'react-i18next';

/** Open comment threads per section, shown next to headings on the page view (D-44). */
export interface SectionComments {
  counts: Map<string, { count: number; first: string }>;
  open: (threadId: string) => void;
}

export const SectionCommentsContext = createContext<SectionComments | null>(null);

function heading(tag: 'h2' | 'h3') {
  return function Heading({
    node: _node,
    children,
    ...rest
  }: { node?: Element; children?: React.ReactNode } & Record<string, unknown>) {
    const ctx = useContext(SectionCommentsContext);
    const { t } = useTranslation();
    const id = typeof rest.id === 'string' ? rest.id : undefined;
    const entry = id ? ctx?.counts.get(id) : undefined;
    return createElement(
      tag,
      rest,
      children,
      entry && ctx ? (
        <button
          type="button"
          onClick={() => ctx.open(entry.first)}
          className="ml-2 inline-flex translate-y-[-2px] items-center gap-1 rounded-full border px-2 py-0.5 align-middle text-xs font-normal text-muted-foreground hover:bg-accent"
          aria-label={t('comments.sectionBadge', { count: entry.count })}
        >
          <MessageSquare className="size-3" /> {entry.count}
        </button>
      ) : null,
    );
  };
}

export const sectionHeadings = { h2: heading('h2'), h3: heading('h3') };
