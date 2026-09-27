import { describe, expect, it } from 'vitest';
import { hasErrors, lint } from '../src/lint';

const FM = '---\ntype: note\nstatus: draft\nowner: toby@team.dev\n---\n';

describe('lint', () => {
  it('passes a well-formed document', () => {
    expect(lint(`${FM}## 개요\n\n본문\n\n### 상세\n`)).toEqual([]);
  });

  it('reports missing frontmatter as a blocking error', () => {
    const v = lint('## 개요\n', { blockingOnly: true });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      ruleId: 'clavis/frontmatter-required',
      severity: 'error',
      line: 1,
    });
    expect(hasErrors(v)).toBe(true);
  });

  it('points invalid frontmatter fields at their line', () => {
    const v = lint('---\ntype: spec\nstatus: done\nowner: toby\n---\n');
    expect(v).toEqual([
      expect.objectContaining({
        ruleId: 'clavis/frontmatter-required',
        line: 3,
        params: { field: 'status' },
      }),
    ]);
  });

  it('reports a missing required field at line 1', () => {
    const v = lint('---\ntype: spec\nstatus: draft\n---\n');
    expect(v[0]).toMatchObject({ line: 1, params: { field: 'owner' } });
  });

  it('reports invalid YAML', () => {
    expect(lint('---\ntype: [spec\n---\n')[0]?.message).toMatch(/not valid YAML/);
  });

  it('reports H1 and heading jumps with document line numbers', () => {
    const v = lint(`${FM}# 제목\n## 개요\n#### 너무 깊음\n`);
    expect(v.map((x) => [x.ruleId, x.line])).toEqual([
      ['clavis/no-h1', 6],
      ['clavis/heading-increment', 8],
    ]);
  });

  it('ignores headings inside fenced code', () => {
    expect(lint(`${FM}\`\`\`md\n# not a heading\n#### nope\n\`\`\`\n`)).toEqual([]);
  });

  it('skips non-blocking rules when blockingOnly is set', () => {
    expect(lint(`${FM}# 제목\n`, { blockingOnly: true })).toEqual([]);
  });

  it('checks attachments and wiki links only when resolvers are given', () => {
    const doc = `${FM}![그림](attachments/arch.png)\n[[결제 정책]] [[PAY:환불]]\n`;
    expect(lint(doc)).toEqual([]);

    const v = lint(doc, {
      attachmentExists: (f) => f === 'other.png',
      resolveLink: (space, title) => space === 'PAY' && title === '환불',
    });
    expect(v.map((x) => [x.ruleId, x.severity, x.line])).toEqual([
      ['clavis/attachment-exists', 'error', 6],
      ['clavis/wiki-link-exists', 'warning', 7],
    ]);
  });
});
