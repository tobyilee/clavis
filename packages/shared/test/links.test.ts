import { describe, expect, it } from 'vitest';
import { extractAttachmentRefs, extractWikiLinks, scanLines } from '../src/markdown';

describe('extractWikiLinks', () => {
  it('parses titles, aliases and space prefixes', () => {
    const lines = scanLines('[[결제 API]] 와 [[PAY:환불 정책|환불]]');
    expect(extractWikiLinks(lines)).toEqual([
      { spaceKey: null, title: '결제 API', alias: null, line: 1, column: 1 },
      { spaceKey: 'PAY', title: '환불 정책', alias: '환불', line: 1, column: 14 },
    ]);
  });

  it('ignores links in code fences and inline code', () => {
    const lines = scanLines('`[[inline]]`\n```\n[[fenced]]\n```\n[[real]]');
    expect(extractWikiLinks(lines).map((l) => l.title)).toEqual(['real']);
  });

  it('treats a lowercase prefix as part of the title', () => {
    expect(extractWikiLinks(scanLines('[[note: 메모]]'))[0]).toMatchObject({
      spaceKey: null,
      title: 'note: 메모',
    });
  });
});

describe('extractAttachmentRefs', () => {
  it('finds image and link references and decodes names', () => {
    const lines = scanLines(
      '![a](attachments/%EC%84%A4%EA%B3%84.png) [b](attachments/spec.pdf "Spec")',
    );
    expect(extractAttachmentRefs(lines).map((r) => r.filename)).toEqual(['설계.png', 'spec.pdf']);
  });
});
