import { describe, expect, it } from 'vitest';
import { lineDiff } from './diff';

const lines = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => `줄 ${from + i}`).join('\n');

describe('lineDiff', () => {
  it('marks added and removed lines with their line numbers', () => {
    const d = lineDiff('a\nb\nc\n', 'a\nB\nc\nd\n');
    expect(d).toMatchObject({ added: 2, removed: 1 });
    expect(d.rows).toEqual([
      { kind: 'same', text: 'a', a: 1, b: 1 },
      { kind: 'del', text: 'b', a: 2 },
      { kind: 'add', text: 'B', b: 2 },
      { kind: 'same', text: 'c', a: 3, b: 3 },
      { kind: 'add', text: 'd', b: 4 },
    ]);
  });

  it('folds long unchanged runs, keeping context around changes', () => {
    const a = `${lines(20)}\n`;
    const b = `${lines(9)}\n바뀐 줄\n${lines(10, 11)}\n`;
    const d = lineDiff(a, b);
    expect(d.rows.map((r) => (r.kind === 'skip' ? `skip ${r.count}` : r.kind))).toEqual([
      'skip 6',
      'same',
      'same',
      'same',
      'del',
      'add',
      'same',
      'same',
      'same',
      'skip 7',
    ]);
  });

  it('shows nothing but a fold when the texts are equal', () => {
    expect(lineDiff(lines(3), lines(3))).toEqual({
      rows: [{ kind: 'skip', count: 3 }],
      added: 0,
      removed: 0,
    });
  });
});
