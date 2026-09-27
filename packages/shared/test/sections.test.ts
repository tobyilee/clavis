import { describe, expect, it } from 'vitest';
import {
  editSection,
  findSection,
  parseSections,
  type Section,
  sectionText,
  updateFrontmatter,
} from '../src/markdown';

const FM = '---\ntype: meeting\nstatus: draft\nowner: toby\n---\n';
const DOC = `${FM}서론\n\n## 참석자\n\n- 토비\n\n## 논의 내용\n\n### API\n\n\`\`\`md\n## 코드 안 헤딩\n\`\`\`\n\n## 액션 아이템\n\n- 할 일 1\n`;

const get = (content: string, ref: string): Section => {
  const r = findSection(parseSections(content), ref);
  if (!('section' in r)) throw new Error(`no section ${ref}`);
  return r.section;
};

describe('parseSections', () => {
  it('lists headings outside code with line ranges including subsections', () => {
    const s = parseSections(DOC);
    expect(s.map(({ id, level, line, endLine }) => ({ id, level, line, endLine }))).toEqual([
      { id: '참석자', level: 2, line: 8, endLine: 11 },
      { id: '논의-내용', level: 2, line: 12, endLine: 19 },
      { id: 'api', level: 3, line: 14, endLine: 19 },
      { id: '액션-아이템', level: 2, line: 20, endLine: 23 },
    ]);
    expect(sectionText(DOC, get(DOC, '액션-아이템'))).toBe('## 액션 아이템\n\n- 할 일 1\n');
  });

  it('makes ids like the rendered anchors: inline syntax stripped, duplicates numbered', () => {
    const doc = `${FM}## **굵은** \`코드\` [[PAY:정책|규정]] [링크](x)\n## 개요\n## 개요\n`;
    expect(parseSections(doc).map((s) => s.id)).toEqual(['굵은-코드-규정-링크', '개요', '개요-1']);
  });

  it('changes the hash only when the section text changes', () => {
    const edited = DOC.replace('- 할 일 1', '- 할 일 1\n- 할 일 2');
    const before = parseSections(DOC);
    const after = parseSections(edited);
    expect(after[0]?.hash).toBe(before[0]?.hash);
    expect(after[3]?.hash).not.toBe(before[3]?.hash);
  });
});

describe('findSection', () => {
  it('finds by id, then by heading text with or without #', () => {
    const sections = parseSections(DOC);
    expect(findSection(sections, '논의-내용')).toMatchObject({ section: { line: 12 } });
    expect(findSection(sections, '액션 아이템')).toMatchObject({ section: { line: 20 } });
    expect(findSection(sections, '## 참석자')).toMatchObject({ section: { line: 8 } });
    expect(findSection(sections, '없음')).toMatchObject({ error: 'not-found' });
    const dup = parseSections(`${FM}## 개요\n## 개요\n`);
    expect(findSection(dup, '개요-1')).toMatchObject({ section: { line: 7 } });
  });

  it('reports ambiguous titles', () => {
    // Ids are unique ("메모-초안", "메모-초안-1"); only the heading text can be ambiguous.
    const doc = `${FM}## A\n### 메모 (초안)\n## B\n### 메모 (초안)\n`;
    expect(findSection(parseSections(doc), '메모 (초안)')).toMatchObject({ error: 'ambiguous' });
  });
});

describe('editSection', () => {
  it('replaces the body and keeps the heading and the blank line before the next one', () => {
    const out = editSection(DOC, get(DOC, '참석자'), 'replace', '- 토비\n- 에이전트\n');
    expect(out).toContain('## 참석자\n\n- 토비\n- 에이전트\n\n## 논의 내용');
    expect(parseSections(out)).toHaveLength(4);
  });

  it('replaces the heading too when the text starts with one of the same level', () => {
    const out = editSection(DOC, get(DOC, '참석자'), 'replace', '## 참석자 (3명)\n\n- 토비');
    expect(out).toContain('서론\n\n## 참석자 (3명)\n\n- 토비\n\n## 논의 내용');
  });

  it('keeps the final newline when replacing the last section', () => {
    const out = editSection(DOC, get(DOC, '액션 아이템'), 'replace', '- 새 할 일');
    expect(out.endsWith('## 액션 아이템\n\n- 새 할 일\n')).toBe(true);
    const noNl = DOC.slice(0, -1);
    expect(editSection(noNl, get(noNl, '액션 아이템'), 'replace', 'x').endsWith('\n\nx')).toBe(
      true,
    );
  });

  it('appends list items to the list, and paragraphs as a new block', () => {
    const items = editSection(DOC, get(DOC, '액션 아이템'), 'append', '- 할 일 2');
    expect(items.endsWith('- 할 일 1\n- 할 일 2\n')).toBe(true);
    const para = editSection(DOC, get(DOC, '참석자'), 'append', '늦게 합류: 민수');
    expect(para).toContain('- 토비\n\n늦게 합류: 민수\n\n## 논의 내용');
  });

  it('appends after subsections, at the end of the whole section', () => {
    const out = editSection(DOC, get(DOC, '논의 내용'), 'append', '정리: 합의함');
    expect(out).toContain('```\n\n정리: 합의함\n\n## 액션 아이템');
  });

  it('adds a separating blank line when the next heading followed directly', () => {
    const doc = `${FM}## A\n본문\n## B\n`;
    expect(editSection(doc, get(doc, 'A'), 'append', '추가')).toBe(
      `${FM}## A\n본문\n\n추가\n\n## B\n`,
    );
  });
});

describe('updateFrontmatter', () => {
  it('sets fields and keeps comments and other keys', () => {
    const doc = '---\ntype: spec # 유형\nstatus: draft\nowner: toby\nextra: 1\n---\n본문\n';
    const out = updateFrontmatter(doc, { status: 'review', tags: ['api', 'pay'] });
    expect(out).toBe(
      '---\ntype: spec # 유형\nstatus: review\nowner: toby\nextra: 1\ntags: [ api, pay ]\n---\n본문\n',
    );
  });
});
