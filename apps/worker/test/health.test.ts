import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('GET /api/v1/health', () => {
  it('reports ok with a working database', async () => {
    const res = await SELF.fetch('https://clavis.test/api/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', version: '0.0.0', db: 'ok' });
  });
});

describe('API errors', () => {
  it('requires authentication for non-public API routes', async () => {
    const res = await SELF.fetch('https://clavis.test/api/v1/nope');
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
  });

  it('serves the OpenAPI document', async () => {
    const res = await SELF.fetch('https://clavis.test/api/v1/openapi.json');
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).toContain('/health');
  });
});
