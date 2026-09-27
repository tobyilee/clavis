import { describe, expect, it } from 'vitest';
import { lint } from '../src/lint';
import { DOC_TYPES } from '../src/schema';
import { findTemplate, renderTemplate, TEMPLATES } from '../src/templates';

describe('templates', () => {
  it('covers every document type', () => {
    expect(TEMPLATES.map((t) => t.type).sort()).toEqual([...DOC_TYPES].sort());
  });

  it.each(DOC_TYPES)('renders a %s page that lints clean in both languages', (type) => {
    for (const locale of ['ko', 'en'] as const) {
      const content = renderTemplate(type, { owner: 'toby@gmail.com', locale });
      expect(lint(content)).toEqual([]);
    }
  });

  it('quotes owners and tags that YAML would misread', () => {
    const content = renderTemplate('note', { owner: 'Toby Lee: PM', tags: ['yes', 'api'] });
    expect(content).toContain('owner: "Toby Lee: PM"');
    expect(content).toContain('tags: ["yes", api]');
    expect(lint(content)).toEqual([]);
  });

  it('puts required sections in the meeting template', () => {
    expect(findTemplate('meeting')?.sections.map((s) => s.ko)).toEqual([
      '참석자',
      '논의 내용',
      '결정 사항',
      '액션 아이템',
    ]);
  });
});
