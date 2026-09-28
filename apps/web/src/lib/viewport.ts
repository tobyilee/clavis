import { useEffect } from 'react';

/**
 * Keeps --vv-top and --vv-height on <html> in step with the visual viewport: the part of the
 * page on screen above the phone's keyboard. iOS Safari doesn't shrink the page for the
 * keyboard (100dvh and fixed elements stay under it) and may scroll the page to show the
 * caret, so anything that must stay in view while typing places itself with these.
 */
export function useVisualViewportVars() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement.style;
    const update = () => {
      root.setProperty('--vv-top', `${vv.offsetTop}px`);
      root.setProperty('--vv-height', `${vv.height}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.removeProperty('--vv-top');
      root.removeProperty('--vv-height');
    };
  }, []);
}
