import { useQuery } from '@tanstack/react-query';
import { ApiError, apiGet } from './api';

export interface Me {
  id: string;
  kind: 'human' | 'agent';
  name: string;
  email: string | null;
  role: 'admin' | 'editor' | 'viewer' | 'pending';
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<Me>('/me'),
    retry: (count, err) => !(err instanceof ApiError && err.problem.status === 401) && count < 1,
  });
}

/** Editors and admins may change pages (D-37). The server enforces it; this only hides UI. */
export function useCanEdit(): boolean {
  const role = useMe().data?.role;
  return role === 'editor' || role === 'admin';
}
