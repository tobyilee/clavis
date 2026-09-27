import { describe, expect, it } from 'vitest';
import { lint, utf8Length } from '../src/lint';
import { scanLines } from '../src/markdown';
import { pageSlugId, parseSlugId, slugify } from '../src/schema';

const fm = (type = 'note') => `---\ntype: ${type}\nstatus: draft\nowner: toby\n---\n`;
const ids = (content: string) => lint(content).map((v) => v.ruleId);

describe('clavis/required-sections', () => {
  it('reports each missing section at the start of the body', () => {
    const v = lint(`${fm('adr')}## Context\n\n## Decision\n`);
    expect(v).toEqual([
      expect.objectContaining({
        ruleId: 'clavis/required-sections',
        severity: 'warning',
        line: 6,
        params: { type: 'adr', section: 'Consequences', sectionEn: 'Consequences' },
      }),
    ]);
  });

  it('accepts English names, spacing differences and trailing words', () => {
    const doc = `${fm('spec')}## Overview\n## 요구 사항\n## 설계 (v2)\n## 미결사항\n`;
    expect(ids(doc)).toEqual([]);
  });

  it('ignores H3 headings and code fences', () => {
    const doc = `${fm('adr')}### Context\n\`\`\`md\n## Decision\n\`\`\`\n## Consequences\n`;
    const missing = lint(doc).filter((v) => v.ruleId === 'clavis/required-sections');
    expect(missing.map((v) => v.params?.section)).toEqual(['Context', 'Decision']);
  });

  it('skips types without required sections', () => {
    expect(ids(`${fm('note')}본문\n`)).toEqual([]);
  });
});

describe('info rules', () => {
  it('flags images without alt text, outside code', () => {
    const v = lint(`${fm()}![](a.png) ![ok](b.png) \`![](c.png)\`\n`);
    expect(v).toEqual([expect.objectContaining({ ruleId: 'clavis/image-alt', column: 1 })]);
  });

  it('flags code fences without a language, but not closing fences', () => {
    const v = lint(`${fm()}\`\`\`\nx\n\`\`\`\n\n\`\`\`ts\ny\n\`\`\`\n`);
    expect(v.map((x) => [x.ruleId, x.line])).toEqual([['clavis/code-lang', 6]]);
  });

  it('suggests splitting long pages', () => {
    const v = lint(`${fm()}${'가'.repeat(20_000)}\n`);
    expect(v).toEqual([
      expect.objectContaining({ ruleId: 'clavis/doc-length', params: { kb: 60, limitKb: 50 } }),
    ]);
  });

  it('counts UTF-8 bytes', () => {
    expect(utf8Length('a가😀')).toBe(new TextEncoder().encode('a가😀').length);
  });
});

describe('scanLines fence info', () => {
  it('records the info string on opening fences only', () => {
    const lines = scanLines('```mermaid\ngraph\n```\n~~~\n~~~');
    expect(lines.map((l) => l.fenceInfo)).toEqual(['mermaid', undefined, undefined, '', undefined]);
  });

  it('does not close a fence on a line with an info string', () => {
    const lines = scanLines('```\n```js\n```\nafter');
    expect(lines.map((l) => l.inFence)).toEqual([true, true, true, false]);
  });
});

describe('page urls', () => {
  it('keeps Korean in slugs', () => {
    expect(slugify('결제 API 설계 (v2)!')).toBe('결제-api-설계-v2');
    expect(slugify('***')).toBe('');
  });

  it('round-trips slug-shortId', () => {
    expect(parseSlugId(pageSlugId('결제-api', 'a1b2c3'))).toBe('a1b2c3');
    expect(parseSlugId('a1b2c3')).toBe('a1b2c3');
    expect(parseSlugId('whatever-a1b2c3')).toBe('a1b2c3');
    expect(parseSlugId('xa1b2c3')).toBeNull();
    expect(parseSlugId('A1B2C3')).toBeNull();
  });
});

describe('server lint budget', () => {
  it('lints a 100KB page quickly (all rules run at save time, D-27)', () => {
    const line = '결제 API [[설계]] 문서 ![](attachments/a.png) '.repeat(4);
    const para = `${line}\n\n## 섹션\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n`;
    const doc = fm('spec') + para.repeat(Math.ceil(100_000 / para.length));
    const env = { resolveLink: () => false, attachmentExists: () => true };
    lint(doc, env);
    const start = performance.now();
    for (let i = 0; i < 10; i++) lint(doc, env);
    // Node is ~5x faster than a deployed Worker (S2); 5ms here leaves room under 10ms there.
    expect((performance.now() - start) / 10).toBeLessThan(5);
  });
});
