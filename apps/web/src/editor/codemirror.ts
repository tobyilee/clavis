import type { Violation } from '@clavis/shared/schema';
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { type Diagnostic, lintGutter, setDiagnostics } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { MarkdownConfig } from '@lezer/markdown';

/** YAML frontmatter at the top of the document, highlighted as metadata. */
const frontmatter: MarkdownConfig = {
  defineNodes: [{ name: 'Frontmatter', block: true, style: tags.meta }],
  parseBlock: [
    {
      name: 'Frontmatter',
      before: 'HorizontalRule',
      parse(cx, line) {
        if (cx.lineStart !== 0 || line.text.trimEnd() !== '---') return false;
        const start = cx.lineStart;
        while (cx.nextLine()) {
          if (line.text.trimEnd() === '---') {
            cx.nextLine();
            break;
          }
        }
        cx.addElement(cx.elt('Frontmatter', start, cx.prevLineEnd()));
        return true;
      },
    },
  ],
};

const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '700', fontSize: '1.25em' },
  { tag: tags.heading2, fontWeight: '700', fontSize: '1.15em' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--cm-link)' },
  { tag: tags.monospace, color: 'var(--cm-code)' },
  { tag: [tags.meta, tags.processingInstruction], color: 'var(--muted-foreground)' },
  { tag: tags.quote, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.operatorKeyword], color: 'var(--cm-keyword)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--cm-string)' },
  { tag: tags.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: [tags.number, tags.bool, tags.atom], color: 'var(--cm-number)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--foreground)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, "D2Coding", monospace',
    fontSize: '14px',
    lineHeight: '1.65',
  },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--foreground)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    border: 'none',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklch, var(--accent) 60%, transparent)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklch, var(--cm-link) 25%, transparent) !important',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--foreground)',
  },
});

export interface Completions {
  /** Page titles of a space; null key = the page's own space. */
  titles(spaceKey: string | null): Promise<string[]>;
  attachments(): string[];
}

const SPACE_PREFIX_RE = /^([A-Z][A-Z0-9]{1,9}):/;

/** [[ → page titles, [[KEY: → titles in that space, ](attachments/ → this page's files. */
function completionSource(get: () => Completions) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const att = context.matchBefore(/\]\(attachments\/[^)\s]*$/);
    if (att) {
      const from = att.from + '](attachments/'.length;
      return {
        from,
        options: get()
          .attachments()
          .map((name) => ({ label: name, apply: encodeURI(name), type: 'variable' })),
        validFor: /^[^)\s]*$/,
      };
    }
    const wiki = context.matchBefore(/\[\[[^\]\n|]*$/);
    if (!wiki) return null;
    const query = wiki.text.slice(2);
    const prefixed = SPACE_PREFIX_RE.exec(query);
    const from = wiki.from + 2 + (prefixed ? prefixed[0].length : 0);
    const closed = context.state.sliceDoc(context.pos, context.pos + 2) === ']]';
    const titles = await get().titles(prefixed?.[1] ?? null);
    return {
      from,
      options: titles.map((title) => ({
        label: title,
        apply: closed ? title : `${title}]]`,
        type: 'text',
      })),
      validFor: /^[^\]\n|]*$/,
    };
  };
}

export interface EditorCallbacks {
  onChange(doc: string): void;
  onSave(): void;
  onScroll(): void;
  completions(): Completions;
}

export function editorExtensions(
  cb: EditorCallbacks,
  opts: { lineNumbers: boolean; placeholder: string },
): Extension[] {
  return [
    opts.lineNumbers ? lineNumbers() : [],
    history(),
    drawSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(true),
    markdown({ base: markdownLanguage, codeLanguages: languages, extensions: [frontmatter] }),
    syntaxHighlighting(highlight),
    autocompletion({ override: [completionSource(cb.completions)], activateOnTyping: true }),
    lintGutter(),
    placeholder(opts.placeholder),
    keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          cb.onSave();
          return true;
        },
      },
      ...completionKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) cb.onChange(u.state.doc.toString());
    }),
    EditorView.domEventHandlers({ scroll: () => cb.onScroll() }),
    theme,
  ];
}

/** Violations → CodeMirror diagnostics (1-based line/column → document offsets). */
export function showViolations(
  view: EditorView,
  violations: Violation[],
  message: (v: Violation) => string,
) {
  const doc = view.state.doc;
  const diagnostics: Diagnostic[] = [];
  for (const v of violations) {
    if (v.line < 1 || v.line > doc.lines) continue;
    const line = doc.line(v.line);
    const from = Math.min(line.from + Math.max((v.column ?? 1) - 1, 0), line.to);
    // Underline from the reported column (or line start) to the end of the line.
    diagnostics.push({
      from,
      to: line.to,
      severity: v.severity,
      message: message(v),
      source: v.ruleId,
    });
  }
  view.dispatch(setDiagnostics(view.state, diagnostics));
}
