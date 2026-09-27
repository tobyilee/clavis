import { toHtml } from 'hast-util-to-html';
import { describe, expect, it } from 'vitest';
import { markdownToHast, type RenderContext } from './render';

const ctx: RenderContext = {
  resolveWiki: (key, title) =>
    title === '있음'
      ? { href: '/s/PAY/p/있음-aaa111', exists: true }
      : { href: `/s/${key ?? 'PAY'}/w/${encodeURIComponent(title)}`, exists: key !== null },
  resolveAttachment: (name) => (name === 'arch.png' ? '/files/att1' : null),
  calloutLabels: { note: '참고', tip: '팁', important: '중요', warning: '주의', caution: '경고' },
};
const FM = '---\ntype: note\nstatus: draft\nowner: t\n---\n';
const html = (md: string) => toHtml(markdownToHast(`${FM}${md}`, ctx).hast);

describe('markdown rendering', () => {
  it('renders wiki links, marking missing ones, and skips code', () => {
    const out = html('[[있음]] [[없음|별칭]] [[ARCH:원칙]] `[[코드]]`\n');
    // URLs are percent-encoded by the pipeline.
    expect(out).toContain(
      `<a href="/s/PAY/p/${encodeURIComponent('있음')}-aaa111" class="wikilink">있음</a>`,
    );
    expect(out).toContain('class="wikilink wikilink-broken"');
    expect(out).toContain('>별칭</a>');
    expect(out).toContain('href="/s/ARCH/w/%EC%9B%90%EC%B9%99" class="wikilink"');
    expect(out).toContain('<code>[[코드]]</code>');
  });

  it('turns GitHub alerts into callouts', () => {
    const out = html('> [!WARNING]\n> 조심하세요\n');
    expect(out).toContain('<blockquote class="callout callout-warning"');
    expect(out).toContain('<p class="callout-title">주의</p>');
    expect(out).toContain('조심하세요');
    expect(out).not.toContain('[!WARNING]');
  });

  it('resolves attachment references', () => {
    const out = html('![그림](attachments/arch.png) [파일](attachments/없음.pdf)\n');
    expect(out).toContain('src="/files/att1"');
    expect(out).toContain('href="#missing-attachment"');
  });

  it('drops raw HTML and script URLs', () => {
    const out = html(
      '<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n',
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('javascript:');
  });

  it('tags blocks with document line numbers and builds the TOC', () => {
    const { hast, toc } = markdownToHast(`${FM}## 개요\n\n본문\n\n### 상세 설명\n`, ctx);
    const out = toHtml(hast);
    // Line 6 is the first body line (5 frontmatter lines).
    expect(out).toContain('<h2 data-line="6" id="개요">');
    expect(out).toContain('<p data-line="8">');
    expect(toc).toEqual([
      { id: '개요', text: '개요', level: 2 },
      { id: '상세-설명', text: '상세 설명', level: 3 },
    ]);
  });

  it('renders GFM tables, task lists and fenced code with a language class', () => {
    const out = html('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] 완료\n\n```ts\nconst a = 1;\n```\n');
    expect(out).toContain('<table');
    expect(out).toContain('type="checkbox"');
    expect(out).toContain('class="language-ts"');
  });
});
