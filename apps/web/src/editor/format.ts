import {
  EditorSelection,
  type EditorState,
  type Line,
  type SelectionRange,
  type TransactionSpec,
} from '@codemirror/state';

/** What the phone toolbar can do to the selection (K1). */
export type FormatKind =
  | 'heading'
  | 'bold'
  | 'bulletList'
  | 'taskList'
  | 'link'
  | 'wikiLink'
  | 'code';

/** The change for a toolbar button: wraps (or unwraps) the selection, or toggles line prefixes. */
export function formatSpec(state: EditorState, kind: FormatKind): TransactionSpec {
  switch (kind) {
    case 'bold':
      return state.changeByRange((range) => wrap(state, range, '**', '**'));
    case 'wikiLink':
      return state.changeByRange((range) => wrap(state, range, '[[', ']]'));
    case 'link':
      return state.changeByRange((range) => link(state, range));
    case 'code':
      return state.changeByRange((range) => code(state, range));
    case 'heading':
      return prefixLines(state, (text) => {
        // ## → ### → plain; a body H1 is against the rules (no-h1), so it becomes ##.
        // A list item becomes a heading, not a heading that starts with "- ".
        const m = /^(#{1,6})\s+/.exec(text);
        if (!m) return { remove: listItem(text).length, insert: '## ' };
        const level = m[1]?.length ?? 0;
        return { remove: m[0].length, insert: level === 1 ? '## ' : level === 2 ? '### ' : '' };
      });
    case 'bulletList':
      return toggleList(state, '- ', (item) => item.bullet && !item.task);
    case 'taskList':
      return toggleList(state, '- [ ] ', (item) => item.task);
  }
}

/** **text**, and back: markers just outside or at the edges of the selection come off. */
function wrap(state: EditorState, range: SelectionRange, before: string, after: string) {
  const { from, to } = range;
  if (
    state.sliceDoc(from - before.length, from) === before &&
    state.sliceDoc(to, to + after.length) === after
  ) {
    return {
      changes: [
        { from: from - before.length, to: from },
        { from: to, to: to + after.length },
      ],
      range: EditorSelection.range(from - before.length, to - before.length),
    };
  }
  const text = state.sliceDoc(from, to);
  if (
    text.length >= before.length + after.length &&
    text.startsWith(before) &&
    text.endsWith(after)
  ) {
    return {
      changes: [
        { from, to: from + before.length },
        { from: to - after.length, to },
      ],
      range: EditorSelection.range(from, to - before.length - after.length),
    };
  }
  return {
    changes: [
      { from, insert: before },
      { from: to, insert: after },
    ],
    range: EditorSelection.range(from + before.length, to + before.length),
  };
}

/** [text](|) for a selection, [|](url) when the selection is a URL, [|]() for none. */
function link(state: EditorState, range: SelectionRange) {
  const text = state.sliceDoc(range.from, range.to);
  const url = /^https?:\/\/\S+$/.test(text);
  const insert = url ? `[](${text})` : `[${text}]()`;
  const cursor = text && !url ? range.from + insert.length - 1 : range.from + 1;
  return {
    changes: { from: range.from, to: range.to, insert },
    range: EditorSelection.cursor(cursor),
  };
}

/** `inline` within a line; a fenced block around whole lines when the selection spans lines. */
function code(state: EditorState, range: SelectionRange) {
  const first = state.doc.lineAt(range.from);
  const last = state.doc.lineAt(range.to);
  if (first.number === last.number) return wrap(state, range, '`', '`');
  return {
    changes: [
      { from: first.from, insert: '```\n' },
      { from: last.to, insert: '\n```' },
    ],
    range: EditorSelection.range(range.from + 4, range.to + 4),
  };
}

/** The lines the selection touches; a selection ending at a line start leaves that line out. */
function selectedLines(state: EditorState): Line[] {
  const lines = new Map<number, Line>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    let last = state.doc.lineAt(range.to).number;
    if (last > first && state.doc.line(last).from === range.to) last--;
    for (let n = first; n <= last; n++) lines.set(n, state.doc.line(n));
  }
  const all = [...lines.values()];
  // Blank lines inside a multi-line selection get no marker; a lone blank line does.
  return all.length > 1 ? all.filter((l) => l.text.trim() !== '') : all;
}

/** Rewrites the start of each selected line (after its indent); the cursor stays after it. */
function prefixLines(
  state: EditorState,
  edit: (text: string) => { remove: number; insert: string },
): TransactionSpec {
  const changes = state.changes(
    selectedLines(state).flatMap((line) => {
      const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
      const { remove, insert } = edit(line.text.slice(indent));
      const from = line.from + indent;
      // A line that already has the marker is left alone, so the selection stays put.
      return state.sliceDoc(from, from + remove) === insert
        ? []
        : [{ from, to: from + remove, insert }];
    }),
  );
  return { changes, selection: state.selection.map(changes, 1) };
}

const LIST_ITEM = /^([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/;

function listItem(text: string) {
  const m = LIST_ITEM.exec(text.trimStart());
  return {
    bullet: !!m && /^[-*+]$/.test(m[1] ?? ''),
    task: !!m?.[2],
    length: m?.[0].length ?? 0,
  };
}

/** Makes every selected line this kind of item (converting other lists), or plain if all are. */
function toggleList(
  state: EditorState,
  marker: string,
  isThis: (item: ReturnType<typeof listItem>) => boolean,
): TransactionSpec {
  const all = selectedLines(state).every((line) => isThis(listItem(line.text)));
  return prefixLines(state, (text) => ({
    remove: listItem(text).length,
    insert: all ? '' : marker,
  }));
}
