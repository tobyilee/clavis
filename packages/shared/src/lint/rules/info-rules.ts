import { stripInlineCode } from '../../markdown/lines';
import type { LintRule, RuleViolation } from '../types';

const EMPTY_ALT_RE = /!\[\s*\]\(/g;

export const imageAlt: LintRule = {
  id: 'clavis/image-alt',
  severity: 'info',
  blocking: false,
  check({ lines }) {
    const out: RuleViolation[] = [];
    for (const l of lines) {
      if (l.inFence || !l.text.includes('![')) continue;
      for (const m of stripInlineCode(l.text).matchAll(EMPTY_ALT_RE)) {
        out.push({
          line: l.line,
          column: (m.index ?? 0) + 1,
          message: 'Image has no alt text.',
        });
      }
    }
    return out;
  },
};

export const codeLang: LintRule = {
  id: 'clavis/code-lang',
  severity: 'info',
  blocking: false,
  check({ lines }) {
    return lines
      .filter((l) => l.fenceInfo === '')
      .map((l) => ({
        line: l.line,
        message: 'Code block has no language (e.g. ```ts), so it cannot be highlighted.',
      }));
  },
};

/** Long pages are hard for AI agents to use in one context window; suggest splitting. */
export const DOC_LENGTH_SOFT_LIMIT = 50_000;

export const docLength: LintRule = {
  id: 'clavis/doc-length',
  severity: 'info',
  blocking: false,
  check({ content }) {
    const bytes = utf8Length(content);
    if (bytes <= DOC_LENGTH_SOFT_LIMIT) return [];
    return [
      {
        line: 1,
        message: `Page is ${Math.round(bytes / 1000)}KB; consider splitting it into child pages (over ${DOC_LENGTH_SOFT_LIMIT / 1000}KB).`,
        params: { kb: Math.round(bytes / 1000), limitKb: DOC_LENGTH_SOFT_LIMIT / 1000 },
      },
    ];
  },
};

/** UTF-8 byte length without allocating an encoded copy. */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
