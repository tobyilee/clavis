import { generateKeyBetween } from 'fractional-indexing';
import { ServiceError } from './errors';

export interface Sibling {
  id: string;
  short_id: string;
  position: string;
}

/**
 * Picks a fractional-index key (D-32) so a move or insert updates only one row. `after` and
 * `before` name a sibling by id or short id; with neither the page goes last.
 */
export function positionAmong(
  siblings: Sibling[],
  opts: { after?: string; before?: string },
  selfId?: string,
): string {
  const list = siblings
    .filter((s) => s.id !== selfId)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  const find = (ref: string) => {
    const i = list.findIndex((s) => s.id === ref || s.short_id === ref);
    if (i < 0) throw new ServiceError(400, 'invalid-sibling', `"${ref}" is not a sibling here`);
    return i;
  };
  let lo: string | null;
  let hi: string | null;
  if (opts.after) {
    const i = find(opts.after);
    lo = list[i]?.position ?? null;
    hi = list[i + 1]?.position ?? null;
  } else if (opts.before) {
    const i = find(opts.before);
    lo = list[i - 1]?.position ?? null;
    hi = list[i]?.position ?? null;
  } else {
    lo = list.at(-1)?.position ?? null;
    hi = null;
  }
  try {
    return generateKeyBetween(lo, hi);
  } catch {
    // Keys written outside the library (e.g. hand-seeded rows) may be invalid; fall back
    // to appending after them, which keeps the order stable.
    return `${lo ?? hi ?? 'a'}V`;
  }
}
