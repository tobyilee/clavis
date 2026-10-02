import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Width of a column of Space keys set in a monospace font: as wide as the longest key (keys
 * run up to 10 characters), so a long key never runs into the name beside it.
 */
export const keyColumnWidth = (keys: string[]) => `${Math.max(3, ...keys.map((k) => k.length))}ch`;

/**
 * onMouseEnter for a link holding a `truncate` label: shows the label's full text as the
 * link's native tooltip only when the ellipsis actually cuts it short, so short labels don't
 * get a redundant one.
 */
export function titleIfTruncated(e: { currentTarget: HTMLElement }) {
  const el = e.currentTarget;
  const label = el.querySelector<HTMLElement>('.truncate') ?? el;
  if (label.scrollWidth > label.clientWidth) el.title = label.textContent ?? '';
  else el.removeAttribute('title');
}
