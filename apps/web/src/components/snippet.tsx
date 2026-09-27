import { SNIPPET_CLOSE, SNIPPET_OPEN } from '@clavis/shared/schema';

/** Renders a search snippet, turning the server's hit markers into <mark> (text only). */
export function Snippet({ text }: { text: string }) {
  const parts = text
    .replace(/\s+/g, ' ')
    .split(new RegExp(`(${SNIPPET_OPEN}[^${SNIPPET_CLOSE}]*${SNIPPET_CLOSE})`));
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith(SNIPPET_OPEN) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
          <mark key={i} className="rounded-sm bg-amber-300/40 px-0.5 text-inherit">
            {part.slice(1, -1)}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
