import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('API rate limit', () => {
  it('returns 429 problem+json with Retry-After once the budget is spent', async () => {
    const headers = { 'cf-connecting-ip': '203.0.113.7' };
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) {
      const res = await SELF.fetch('https://clavis.test/api/v1/health', { headers });
      statuses.push(res.status);
      if (res.status === 429) {
        expect(res.headers.get('retry-after')).toBe('60');
        expect(res.headers.get('content-type')).toBe('application/problem+json');
        break;
      }
      await res.arrayBuffer();
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(120);
    expect(statuses.at(-1)).toBe(429);
  });

  it('keeps separate budgets per caller', async () => {
    const res = await SELF.fetch('https://clavis.test/api/v1/health', {
      headers: { 'cf-connecting-ip': '198.51.100.9' },
    });
    expect(res.status).toBe(200);
  });
});

describe('people', () => {
  it('get a larger budget than agents', async () => {
    const { call, resetDb } = await import('./helpers');
    await resetDb();
    let ok = 0;
    for (let i = 0; i < 130; i++) {
      const res = await call('/api/v1/me', { as: 'busy@gmail.com' });
      if (res.status === 200) ok++;
    }
    expect(ok).toBe(130);
  });
});
