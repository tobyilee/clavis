import type { SearchHit } from '@clavis/shared/schema';
import { apiGet } from './api';

export type SearchMode = 'text' | 'semantic' | 'hybrid';

export interface SearchParams {
  q: string;
  mode?: SearchMode;
  space?: string;
  type?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

/** `mode` in the result is the one that ran: semantic and hybrid fall back to text. */
export function searchPages(p: SearchParams) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') qs.set(k, String(v));
  return apiGet<{ hits: SearchHit[]; nextCursor: string | null; mode?: SearchMode }>(
    `/search?${qs}`,
  );
}
