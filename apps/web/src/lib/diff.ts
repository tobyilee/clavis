import { diffLines } from 'diff';

/** One row of a line diff, with line numbers in the old (a) and new (b) text. */
export type DiffRow =
  | { kind: 'same' | 'add' | 'del'; text: string; a?: number; b?: number }
  /** Unchanged lines folded away. */
  | { kind: 'skip'; count: number };

export interface LineDiff {
  rows: DiffRow[];
  added: number;
  removed: number;
}

/**
 * Line diff of two revisions, computed in the browser (no server CPU, D-54). Long runs of
 * unchanged lines are folded, keeping `context` lines around each change.
 */
export function lineDiff(a: string, b: string, context = 3): LineDiff {
  const rows: Exclude<DiffRow, { kind: 'skip' }>[] = [];
  let lineA = 1;
  let lineB = 1;
  let added = 0;
  let removed = 0;
  for (const part of diffLines(a, b)) {
    const lines = part.value.replace(/\n$/, '').split('\n');
    for (const text of lines) {
      if (part.added) {
        rows.push({ kind: 'add', text, b: lineB++ });
        added++;
      } else if (part.removed) {
        rows.push({ kind: 'del', text, a: lineA++ });
        removed++;
      } else {
        rows.push({ kind: 'same', text, a: lineA++, b: lineB++ });
      }
    }
  }
  return { rows: fold(rows, context), added, removed };
}

function fold(rows: Exclude<DiffRow, { kind: 'skip' }>[], context: number): DiffRow[] {
  const out: DiffRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i]?.kind !== 'same') {
      out.push(rows[i] as DiffRow);
      i++;
      continue;
    }
    let end = i;
    while (end < rows.length && rows[end]?.kind === 'same') end++;
    // Keep context after the previous change and before the next one.
    const keepHead = i === 0 ? 0 : context;
    const keepTail = end === rows.length ? 0 : context;
    const run = end - i;
    if (run > keepHead + keepTail + 1) {
      out.push(...rows.slice(i, i + keepHead));
      out.push({ kind: 'skip', count: run - keepHead - keepTail });
      out.push(...rows.slice(end - keepTail, end));
    } else {
      out.push(...rows.slice(i, end));
    }
    i = end;
  }
  return out;
}
