import { useMemo } from 'react';
import type { EditorAttachments } from '@/editor/page-editor';

/** A page's attachments for the editor and renderer. Filled in by Step 5 (F1/F2). */
export function useAttachments(_pageId: string | null): EditorAttachments {
  return useMemo(() => ({ names: null, resolve: () => null }), []);
}
