import { mentionMarkup } from '@clavis/shared/markdown';
import type { ActorRef } from '@clavis/shared/schema';
import { cn } from 'cn';
import { Bot, User } from 'lucide-react';
import { type ComponentProps, useMemo, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/input';
import { useMentionable } from '@/lib/notifications';

type Props = Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

// "@" at the start or after a space, then the name typed so far, right before the caret.
const TRIGGER_RE = /(^|\s)@([\p{L}\p{N}._-]{0,32})$/u;

/**
 * A comment box with @mention autocomplete (N3). Picking someone inserts the stored form,
 * @[name](actor:id), so the mention survives a rename.
 */
export function MentionTextarea({ value, onChange, onKeyDown, className, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const actors = useMentionable(query !== null);
  const matches = useMemo(() => {
    if (!query || !actors.data) return [];
    const q = query.text.toLowerCase();
    return actors.data.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, actors.data]);

  const detect = (text: string, caret: number) => {
    const m = TRIGGER_RE.exec(text.slice(0, caret));
    setQuery(m ? { start: caret - (m[2]?.length ?? 0) - 1, text: m[2] ?? '' } : null);
    setActive(0);
  };

  const pick = (actor: ActorRef) => {
    const el = ref.current;
    if (!query || !el) return;
    const insert = `${mentionMarkup(actor.name, actor.id)} `;
    const caret = el.selectionStart;
    onChange(value.slice(0, query.start) + insert + value.slice(caret));
    setQuery(null);
    const pos = query.start + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const open = query !== null && matches.length > 0;
  return (
    <div className="relative">
      <Textarea
        {...rest}
        ref={ref}
        value={value}
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onBlur={() => setQuery(null)}
        onKeyDown={(e) => {
          if (open && !e.metaKey && !e.ctrlKey) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const step = e.key === 'ArrowDown' ? 1 : -1;
              setActive((i) => (i + step + matches.length) % matches.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              const chosen = matches[active];
              if (chosen) pick(chosen);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setQuery(null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
      />
      {open && (
        <div
          role="listbox"
          className="absolute top-full left-0 z-20 mt-1 w-60 overflow-hidden rounded-md border bg-popover py-1 text-sm shadow-md"
        >
          {matches.map((a, i) => {
            const Icon = a.kind === 'agent' ? Bot : User;
            return (
              <div
                key={a.id}
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-1.5',
                  i === active && 'bg-accent',
                )}
                // mousedown, not click: keep the textarea's focus (and caret) until the pick.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(a);
                }}
              >
                <Icon className="size-3.5 text-muted-foreground" />
                {a.name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
