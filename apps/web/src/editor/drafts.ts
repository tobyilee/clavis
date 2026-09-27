import { storage } from '@/lib/storage';

/** Unsaved edits survive a closed tab or a crash (plan E5). Per browser only. */
export interface Draft {
  title: string;
  content: string;
  baseRevision: number;
  savedAt: number;
}

const key = (pageId: string) => `clavis.draft.${pageId}`;

export const drafts = {
  load(pageId: string): Draft | null {
    try {
      const raw = storage.get(key(pageId));
      return raw ? (JSON.parse(raw) as Draft) : null;
    } catch {
      return null;
    }
  },
  save(pageId: string, draft: Omit<Draft, 'savedAt'>) {
    storage.set(key(pageId), JSON.stringify({ ...draft, savedAt: Date.now() }));
  },
  clear(pageId: string) {
    storage.remove(key(pageId));
  },
};
