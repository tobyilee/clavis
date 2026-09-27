import type { SearchHit } from '@clavis/shared/schema';
import { apiGet } from './api';

export interface SearchParams {
  q: string;
  space?: string;
  type?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export function searchPages(p: SearchParams) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') qs.set(k, String(v));
  return apiGet<{ hits: SearchHit[]; nextCursor: string | null }>(`/search?${qs}`);
}
