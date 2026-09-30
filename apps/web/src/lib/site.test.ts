import { describe, expect, it } from 'vitest';
import { formatSiteTitle } from './site';

describe('formatSiteTitle', () => {
  it('puts the title after "Clavis", or shows "Clavis" alone', () => {
    expect(formatSiteTitle('결제팀 위키')).toBe('Clavis - 결제팀 위키');
    expect(formatSiteTitle(null)).toBe('Clavis');
    expect(formatSiteTitle(undefined)).toBe('Clavis');
    expect(formatSiteTitle('')).toBe('Clavis');
  });
});
