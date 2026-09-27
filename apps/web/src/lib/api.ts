import type { Problem } from '@clavis/shared/schema';

export class ApiError extends Error {
  constructor(public readonly problem: Problem) {
    super(problem.title);
  }
  get status() {
    return this.problem.status;
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Calls /api/v1 and returns the raw response; failures throw ApiError (problem+json). */
export async function apiFetch(path: string, opts: ApiOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (!res.ok && res.status !== 304) {
    const isProblem = res.headers.get('content-type')?.includes('problem+json');
    throw new ApiError(
      isProblem
        ? ((await res.json()) as Problem)
        : { type: 'about:blank', title: res.statusText, status: res.status },
    );
  }
  return res;
}

export async function apiGet<T>(path: string): Promise<T> {
  return (await (await apiFetch(path)).json()) as T;
}

export async function apiSend<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, { method, body });
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const isApiError = (e: unknown, status?: number): e is ApiError =>
  e instanceof ApiError && (status === undefined || e.status === status);
