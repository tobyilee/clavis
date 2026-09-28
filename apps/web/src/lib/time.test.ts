import { describe, expect, it } from 'vitest';
import { relativeTime } from './time';

describe('relativeTime', () => {
  const now = Date.UTC(2026, 8, 28, 12);
  it('says "now" under a minute, then minutes, hours and days', () => {
    expect(relativeTime(now - 20_000, 'ko', now)).toBe('지금');
    expect(relativeTime(now - 20_000, 'en', now)).toBe('now');
    expect(relativeTime(now - 3 * 60_000, 'ko', now)).toBe('3분 전');
    expect(relativeTime(now - 2 * 3_600_000, 'en', now)).toBe('2 hours ago');
    expect(relativeTime(now - 86_400_000, 'ko', now)).toBe('어제');
  });
});
