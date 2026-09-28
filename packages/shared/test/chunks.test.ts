import { describe, expect, it } from 'vitest';
import { CHUNK_MAX_CHARS, chunkPage } from '../src/markdown';

const FM = '---\ntype: spec\nstatus: draft\nowner: toby\n---\n';

describe('chunkPage (D-63)', () => {
  it('splits at H2, keeps H3 with its H2, and prefixes the title path', () => {
    const doc = `${FM}결제 흐름을 정리한다.\n\n## 배경\n\n카드 결제만 지원한다.\n\n## 설계\n\n### API\n\n\`POST /pay\`\n\n### 저장\n\n[[원장]]에 기록한다.\n\n## 빈 섹션\n`;
    const chunks = chunkPage('결제 API', doc);
    expect(chunks.map((c) => [c.sectionId, c.heading])).toEqual([
      [null, null],
      ['배경', '배경'],
      ['설계', '설계'],
    ]);
    expect(chunks[0]?.text).toBe('결제 API\n\n결제 흐름을 정리한다.');
    expect(chunks[1]?.text).toBe('결제 API › 배경\n\n카드 결제만 지원한다.');
    expect(chunks[2]?.text).toContain('### 저장');
    expect(chunks[2]?.excerpt).toBe('API POST /pay 저장 원장에 기록한다.');
  });

  it('splits a long section at blank lines, and a page without H2 too', () => {
    const para = (n: number) => `${'가'.repeat(700)} ${n}`;
    const body = [1, 2, 3, 4, 5].map(para).join('\n\n');
    const chunks = chunkPage('긴 문서', `${FM}${body}\n\n## 끝\n\n${'나'.repeat(4500)}\n`);
    const intro = chunks.filter((c) => c.sectionId === null);
    expect(intro).toHaveLength(3); // 5 paragraphs of ~700 chars, at most 2 per chunk
    expect(intro[0]?.text.startsWith('긴 문서\n\n')).toBe(true);
    // One 4,500-character line: cut by characters.
    const end = chunks.filter((c) => c.sectionId === '끝');
    expect(end.map((c) => c.text.length - '긴 문서 › 끝\n\n'.length)).toEqual([2000, 2000, 500]);
    for (const c of chunks) expect(c.text.length).toBeLessThan(CHUNK_MAX_CHARS + 20);
  });

  it('gives a page with no text no chunks', () => {
    expect(chunkPage('빈 문서', `${FM}\n`)).toEqual([]);
  });
});
