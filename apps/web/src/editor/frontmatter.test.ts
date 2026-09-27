import { describe, expect, it } from 'vitest';
import { readFrontmatter, updateFrontmatter } from './frontmatter';
import { markdownlintViolations } from './markdownlint';

const doc =
  '---\n# 담당자는 PM\ntype: spec\nstatus: draft\nowner: toby\ntags: [api]\nextra: 1\n---\n## 개요\n';

describe('frontmatter form sync', () => {
  it('reads fields', () => {
    expect(readFrontmatter(doc)).toEqual({
      fields: { type: 'spec', status: 'draft', owner: 'toby', tags: ['api'] },
      valid: true,
    });
  });

  it('updates fields and keeps comments, order and unknown keys', () => {
    const out = updateFrontmatter(doc, { status: 'review', tags: ['api', 'pay'] });
    expect(out).toBe(
      '---\n# 담당자는 PM\ntype: spec\nstatus: review\nowner: toby\ntags: [ api, pay ]\nextra: 1\n---\n## 개요\n',
    );
  });

  it('creates frontmatter when missing', () => {
    const out = updateFrontmatter('본문\n', { type: 'note' });
    expect(out).toBe('---\ntype: note\n---\n본문\n');
  });

  it('leaves broken YAML alone', () => {
    const broken = '---\ntype: [spec\n---\n';
    expect(updateFrontmatter(broken, { status: 'draft' })).toBe(broken);
    expect(readFrontmatter(broken).valid).toBe(false);
  });
});

describe('markdownlint adapter', () => {
  it('reports style issues with document line numbers, skipping Clavis-covered rules', () => {
    // One trailing space (MD009), and no blank line after the fence (MD031). The fence has
    // no language, but that is clavis/code-lang's job, so MD040 stays quiet.
    const v = markdownlintViolations(
      '---\ntype: note\n---\n## 제목 \n\n```\nx\n```\n[[위키 링크]]\n',
    );
    expect(v.map((x) => [x.ruleId, x.line])).toEqual([
      ['markdownlint/MD009', 4],
      ['markdownlint/MD031', 8],
    ]);
    expect(v[0]?.severity).toBe('info');
  });
});
