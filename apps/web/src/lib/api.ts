import type { Problem } from '@clavis/shared/schema';

export class ApiError extends Error {
  constructor(public readonly problem: Problem) {
    super(problem.title);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const isProblem = res.headers.get('content-type')?.includes('problem+json');
    throw new ApiError(
      isProblem
        ? ((await res.json()) as Problem)
        : { type: 'about:blank', title: res.statusText, status: res.status },
    );
  }
  return (await res.json()) as T;
}
