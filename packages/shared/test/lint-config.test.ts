import { describe, expect, it } from 'vitest';
import { hasErrors, lint, sectionsFor } from '../src/lint';
import { type LintConfig, LintConfigSchema } from '../src/schema';

const fm = (type = 'note') => `---\ntype: ${type}\nstatus: draft\nowner: toby\n---\n`;
const config = (c: unknown): LintConfig => LintConfigSchema.parse(c);

describe('Space lint config (D-47)', () => {
  const doc = `${fm('adr')}# 제목\n\n## Context\n\n\`\`\`\ncode\n\`\`\`\n`;

  it('matches the defaults when no config is given', () => {
    expect(lint(doc, { config: config({}) })).toEqual(lint(doc));
  });

  it('changes a rule severity, and error blocks', () => {
    const v = lint(doc, { config: config({ rules: { 'clavis/no-h1': 'error' } }) });
    expect(v.find((x) => x.ruleId === 'clavis/no-h1')?.severity).toBe('error');
    expect(hasErrors(v)).toBe(true);
    expect(hasErrors(lint(doc))).toBe(false);
  });

  it('turns rules off', () => {
    const off = config({ rules: { 'clavis/code-lang': 'off', 'clavis/required-sections': 'off' } });
    const ids = lint(doc, { config: off }).map((v) => v.ruleId);
    expect(ids).not.toContain('clavis/code-lang');
    expect(ids).not.toContain('clavis/required-sections');
    expect(ids).toContain('clavis/no-h1');
  });

  it('runs only error-level rules with blockingOnly', () => {
    const c = config({ rules: { 'clavis/code-lang': 'error' } });
    expect(lint(doc, { config: c, blockingOnly: true }).map((v) => v.ruleId)).toEqual([
      'clavis/code-lang',
    ]);
  });

  it('cannot retune frontmatter-required', () => {
    expect(() => config({ rules: { 'clavis/frontmatter-required': 'off' } })).toThrow();
    expect(() => config({ unknown: true })).toThrow();
  });

  it('replaces required sections per type', () => {
    const c = config({
      requiredSections: { adr: [{ ko: '배경' }, { ko: '결정', en: 'Decision' }] },
    });
    expect(sectionsFor('adr', c)).toEqual([
      { ko: '배경', en: '배경' },
      { ko: '결정', en: 'Decision' },
    ]);
    const missing = lint(`${fm('adr')}## Decision\n`, { config: c })
      .filter((v) => v.ruleId === 'clavis/required-sections')
      .map((v) => v.params?.section);
    expect(missing).toEqual(['배경']);
    // Types the config leaves out keep their template sections; an empty list means none.
    expect(sectionsFor('spec', c).length).toBeGreaterThan(0);
    expect(sectionsFor('spec', config({ requiredSections: { spec: [] } }))).toEqual([]);
  });

  it('uses the Space doc length limit', () => {
    const body = `${fm()}${'a'.repeat(12_000)}\n`;
    const c = config({ docLengthKb: 10 });
    expect(lint(body, { config: c }).find((v) => v.ruleId === 'clavis/doc-length')?.params).toEqual(
      {
        kb: 12,
        limitKb: 10,
      },
    );
    expect(lint(body).map((v) => v.ruleId)).not.toContain('clavis/doc-length');
  });
});
