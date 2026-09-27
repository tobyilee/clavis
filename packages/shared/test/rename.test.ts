import { describe, expect, it } from 'vitest';
import { renameWikiLinks } from '../src/markdown';

const target = { spaceKey: 'PAY', oldTitle: '환불 정책', newTitle: '환불 규정' };

describe('renameWikiLinks', () => {
  it('rewrites plain, aliased and prefixed links in the same space', () => {
    const out = renameWikiLinks(
      '[[환불 정책]] [[환불 정책|정책]] [[PAY:환불 정책]] [[ 환불 정책 ]]\n',
      'PAY',
      target,
    );
    expect(out).toEqual({
      content: '[[환불 규정]] [[환불 규정|정책]] [[PAY:환불 규정]] [[환불 규정]]\n',
      count: 4,
    });
  });

  it('from another space, only prefixed links point at the renamed page', () => {
    const out = renameWikiLinks('[[환불 정책]] [[PAY:환불 정책]]\n', 'ARCH', target);
    expect(out.content).toBe('[[환불 정책]] [[PAY:환불 규정]]\n');
    expect(out.count).toBe(1);
  });

  it('leaves code blocks, inline code and other titles alone', () => {
    const doc = '```md\n[[환불 정책]]\n```\n`[[환불 정책]]` [[환불 정책 초안]] [[환불 정책]]\n';
    const out = renameWikiLinks(doc, 'PAY', target);
    expect(out.content).toBe(
      '```md\n[[환불 정책]]\n```\n`[[환불 정책]]` [[환불 정책 초안]] [[환불 규정]]\n',
    );
    expect(out.count).toBe(1);
  });

  it('keeps CRLF line endings and returns the same string when nothing matches', () => {
    expect(renameWikiLinks('a\r\n[[환불 정책]]\r\n', 'PAY', target).content).toBe(
      'a\r\n[[환불 규정]]\r\n',
    );
    const same = 'nothing here\n';
    expect(renameWikiLinks(same, 'PAY', target).content).toBe(same);
  });
});
