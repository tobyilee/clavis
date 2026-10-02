import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from 'react';
import { storage } from '@/lib/storage';

const WIDTH_KEY = 'clavis.sidebar.width';
const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 200;
const MAX_WIDTH = 560;
const KEY_STEP = 16;

/** Never wider than half the window, so the page always keeps the larger share. */
const clamp = (w: number) =>
  Math.round(Math.max(MIN_WIDTH, Math.min(w, MAX_WIDTH, window.innerWidth / 2)));

function loadWidth(): number {
  const saved = Number(storage.get(WIDTH_KEY));
  return saved ? clamp(saved) : DEFAULT_WIDTH;
}

/**
 * The desktop sidebar, widened or narrowed by dragging its right edge (or the arrow keys on
 * the focused edge); a double click restores the default. The width is a per-viewer nicety.
 */
export function ResizableAside({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(loadWidth);
  const asideRef = useRef<HTMLElement>(null);
  const drag = useRef<{ startX: number; startWidth: number; width: number } | null>(null);

  const commit = (w: number) => {
    setWidth(w);
    if (w === DEFAULT_WIDTH) storage.remove(WIDTH_KEY);
    else storage.set(WIDTH_KEY, String(w));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection while dragging
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width, width };
    document.body.style.cursor = 'col-resize';
  };
  // Moves the edge without re-rendering the sidebar on every pointer event.
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !asideRef.current) return;
    d.width = clamp(d.startWidth + e.clientX - d.startX);
    asideRef.current.style.width = `${d.width}px`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    document.body.style.cursor = '';
    commit(d.width);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowLeft' ? -KEY_STEP : e.key === 'ArrowRight' ? KEY_STEP : 0;
    if (!step) return;
    e.preventDefault();
    commit(clamp(width + step));
  };

  return (
    <aside
      ref={asideRef}
      className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] max-w-[50vw] shrink-0 border-r bg-sidebar md:block"
      style={{ width }}
    >
      {children}
      {/* A wide invisible grip over the border; the line shows on hover, focus and drag. */}
      {/* biome-ignore lint/a11y/useSemanticElements: a focusable splitter has no native element */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => commit(DEFAULT_WIDTH)}
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors hover:after:bg-link focus-visible:after:bg-link active:after:bg-link"
      />
    </aside>
  );
}
