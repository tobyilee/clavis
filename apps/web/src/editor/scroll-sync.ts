import { type RefObject, useCallback, useRef } from 'react';
import type { MarkdownEditorHandle } from './markdown-editor';

/**
 * Keeps the editor and preview aligned by source line: preview blocks carry data-line
 * (rehypeDataLine), and positions between two blocks are interpolated. Whichever pane the
 * person scrolls drives the other; the echo scroll is ignored briefly to avoid a loop.
 */
export function useScrollSync(
  editor: RefObject<MarkdownEditorHandle | null>,
  preview: RefObject<HTMLDivElement | null>,
) {
  const driver = useRef<'editor' | 'preview' | null>(null);
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lead = useCallback((who: 'editor' | 'preview') => {
    if (driver.current && driver.current !== who) return false;
    driver.current = who;
    clearTimeout(release.current);
    release.current = setTimeout(() => {
      driver.current = null;
    }, 120);
    return true;
  }, []);

  const blocks = useCallback(
    () =>
      [...(preview.current?.querySelectorAll<HTMLElement>('[data-line]') ?? [])].map((el) => ({
        el,
        line: Number(el.dataset.line),
      })),
    [preview],
  );

  const onEditorScroll = useCallback(() => {
    const pane = preview.current;
    const ed = editor.current;
    if (!pane || !ed || !lead('editor')) return;
    const line = ed.topLine();
    const list = blocks();
    let before = list[0];
    let after: (typeof list)[number] | undefined;
    for (const b of list) {
      if (b.line <= line) before = b;
      else {
        after = b;
        break;
      }
    }
    if (!before) return;
    const top = (el: HTMLElement) =>
      el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    const t0 = top(before.el);
    const ratio =
      after && after.line > before.line ? (line - before.line) / (after.line - before.line) : 0;
    pane.scrollTop = t0 + (after ? (top(after.el) - t0) * ratio : 0);
  }, [editor, preview, lead, blocks]);

  const onPreviewScroll = useCallback(() => {
    const pane = preview.current;
    const ed = editor.current;
    if (!pane || !ed || !lead('preview')) return;
    const paneTop = pane.getBoundingClientRect().top;
    const list = blocks().map((b) => ({ ...b, top: b.el.getBoundingClientRect().top - paneTop }));
    let before = list[0];
    let after: (typeof list)[number] | undefined;
    for (const b of list) {
      if (b.top <= 0) before = b;
      else {
        after = b;
        break;
      }
    }
    if (!before) return;
    const ratio = after && after.top > before.top ? -before.top / (after.top - before.top) : 0;
    ed.scrollToLine(
      before.line + (after ? (after.line - before.line) * Math.min(Math.max(ratio, 0), 1) : 0),
    );
  }, [editor, preview, lead, blocks]);

  return { onEditorScroll, onPreviewScroll };
}
