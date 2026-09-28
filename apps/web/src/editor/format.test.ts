import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { type FormatKind, formatSpec } from './format';

/** Applies a toolbar format to a document where | is the cursor and «…» the selection. */
function format(marked: string, kind: FormatKind): string {
  const anchor = marked.includes('|') ? marked.indexOf('|') : marked.indexOf('«');
  const doc = marked.replace(/[|«»]/g, '');
  const head = marked.includes('»') ? marked.indexOf('»') - 1 : anchor;
  const state = EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });
  const next = state.update(formatSpec(state, kind)).state;
  const { from, to } = next.selection.main;
  const text = next.doc.toString();
  return from === to
    ? `${text.slice(0, from)}|${text.slice(from)}`
    : `${text.slice(0, from)}«${text.slice(from, to)}»${text.slice(to)}`;
}

describe('toolbar formats', () => {
  it('wraps and unwraps bold', () => {
    expect(format('a «word» b', 'bold')).toBe('a **«word»** b');
    expect(format('a **«word»** b', 'bold')).toBe('a «word» b');
    expect(format('a «**word**» b', 'bold')).toBe('a «word» b');
    expect(format('a | b', 'bold')).toBe('a **|** b');
    expect(format('a **|** b', 'bold')).toBe('a | b');
  });

  it('cycles headings ## → ### → plain, keeping the cursor', () => {
    expect(format('제|목', 'heading')).toBe('## 제|목');
    expect(format('## 제|목', 'heading')).toBe('### 제|목');
    expect(format('### 제|목', 'heading')).toBe('제|목');
    expect(format('# 제|목', 'heading')).toBe('## 제|목');
    expect(format('- [ ] 제|목', 'heading')).toBe('## 제|목');
  });

  it('toggles bullets on every selected line, skipping blank ones', () => {
    expect(format('«one\n\ntwo»', 'bulletList')).toBe('- «one\n\n- two»');
    expect(format('«- one\n- two»', 'bulletList')).toBe('«one\ntwo»');
    expect(format('«- one\ntwo»', 'bulletList')).toBe('«- one\n- two»');
    expect(format('1. o|ne', 'bulletList')).toBe('- o|ne');
    expect(format('|', 'bulletList')).toBe('- |');
  });

  it('turns lines and bullets into checklist items and back', () => {
    expect(format('할 |일', 'taskList')).toBe('- [ ] 할 |일');
    expect(format('- 할 |일', 'taskList')).toBe('- [ ] 할 |일');
    expect(format('- [x] 할 |일', 'taskList')).toBe('할 |일');
    expect(format('  - [ ] 할 |일', 'bulletList')).toBe('  - 할 |일');
  });

  it('leaves out a last line the selection only reaches the start of', () => {
    expect(format('«one\n»two', 'taskList')).toBe('- [ ] «one\n»two');
  });

  it('makes links with the cursor where the missing part goes', () => {
    expect(format('see «docs»', 'link')).toBe('see [docs](|)');
    expect(format('«https://a.io/x»', 'link')).toBe('[|](https://a.io/x)');
    expect(format('|', 'link')).toBe('[|]()');
  });

  it('wraps wiki links', () => {
    expect(format('|', 'wikiLink')).toBe('[[|]]');
    expect(format('«회의록»', 'wikiLink')).toBe('[[«회의록»]]');
  });

  it('uses inline code within a line and a fence across lines', () => {
    expect(format('run «pnpm dev» now', 'code')).toBe('run `«pnpm dev»` now');
    expect(format('«a\nb»', 'code')).toBe('```\n«a\nb»\n```');
  });
});
