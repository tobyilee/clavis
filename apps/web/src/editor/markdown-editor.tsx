import type { Violation } from '@clavis/shared/schema';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { type Completions, editorExtensions, showViolations } from './codemirror';

export interface MarkdownEditorHandle {
  /** Moves the cursor to a 1-based line and focuses the editor. */
  gotoLine(line: number): void;
  /** The 1-based document line at the top of the visible area. */
  topLine(): number;
  /** Scrolls so the given (possibly fractional) line is at the top. */
  scrollToLine(line: number): void;
  /** Replaces the whole document (e.g. after loading the latest revision). */
  setDoc(doc: string): void;
  /** Inserts text at the cursor, returning the inserted range. */
  insert(text: string): { from: number; to: number };
  /** Replaces a range, e.g. an upload placeholder. */
  replaceRange(from: number, to: number, text: string): void;
  getDoc(): string;
}

interface Props {
  initialDoc: string;
  violations: Violation[];
  messageFor: (v: Violation) => string;
  onChange: (doc: string) => void;
  onSave: () => void;
  onScroll?: () => void;
  completions: () => Completions;
  lineNumbers: boolean;
  placeholder: string;
  onPasteFiles?: (files: File[]) => void;
}

/** CodeMirror 6 owns the text; React only hears about changes (no controlled re-renders). */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(
  function MarkdownEditor(props, ref) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView | null>(null);
    // Callbacks change every render; the editor reads the latest through this ref.
    const latest = useRef(props);
    latest.current = props;

    useEffect(() => {
      if (!host.current) return;
      const v = new EditorView({
        parent: host.current,
        state: EditorState.create({
          doc: latest.current.initialDoc,
          extensions: [
            editorExtensions(
              {
                onChange: (doc) => latest.current.onChange(doc),
                onSave: () => latest.current.onSave(),
                onScroll: () => latest.current.onScroll?.(),
                completions: () => latest.current.completions(),
              },
              { lineNumbers: latest.current.lineNumbers, placeholder: latest.current.placeholder },
            ),
            EditorView.domEventHandlers({
              paste: (e) => filesFrom(e.clipboardData?.files, latest.current.onPasteFiles),
              drop: (e) => filesFrom(e.dataTransfer?.files, latest.current.onPasteFiles),
            }),
          ],
        }),
      });
      view.current = v;
      return () => {
        v.destroy();
        view.current = null;
      };
    }, []);

    useEffect(() => {
      if (view.current) showViolations(view.current, props.violations, props.messageFor);
    }, [props.violations, props.messageFor]);

    useImperativeHandle(ref, () => ({
      gotoLine(line) {
        const v = view.current;
        if (!v) return;
        const pos = v.state.doc.line(Math.min(Math.max(line, 1), v.state.doc.lines)).from;
        v.dispatch({ selection: EditorSelection.cursor(pos), scrollIntoView: true });
        v.focus();
      },
      topLine() {
        const v = view.current;
        if (!v) return 1;
        // Block heights are measured from the top of the document, like scrollTop.
        const block = v.lineBlockAtHeight(v.scrollDOM.scrollTop);
        return v.state.doc.lineAt(block.from).number;
      },
      scrollToLine(line) {
        const v = view.current;
        if (!v) return;
        const n = Math.min(Math.max(Math.floor(line), 1), v.state.doc.lines);
        const block = v.lineBlockAt(v.state.doc.line(n).from);
        v.scrollDOM.scrollTop = block.top + (line - n) * block.height;
      },
      setDoc(doc) {
        const v = view.current;
        if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: doc } });
      },
      insert(text) {
        const v = view.current;
        if (!v) return { from: 0, to: 0 };
        const { from, to } = v.state.selection.main;
        v.dispatch({
          changes: { from, to, insert: text },
          selection: EditorSelection.cursor(from + text.length),
        });
        v.focus();
        return { from, to: from + text.length };
      },
      replaceRange(from, to, text) {
        view.current?.dispatch({ changes: { from, to, insert: text } });
      },
      getDoc: () => view.current?.state.doc.toString() ?? '',
    }));

    return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
  },
);

/** Pasted or dropped files go to the upload handler instead of the text. */
function filesFrom(list: FileList | undefined | null, handler?: (files: File[]) => void): boolean {
  if (!handler || !list || list.length === 0) return false;
  handler([...list]);
  return true;
}
