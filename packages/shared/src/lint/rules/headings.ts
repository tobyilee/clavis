import type { LintRule, RuleViolation } from '../types';

const ATX_HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;

export interface Heading {
  level: number;
  text: string;
  line: number;
}

/** ATX headings outside code fences. */
export function headings(lines: { text: string; line: number; inFence: boolean }[]): Heading[] {
  const out: Heading[] = [];
  for (const l of lines) {
    if (l.inFence) continue;
    const m = ATX_HEADING_RE.exec(l.text);
    if (m?.[1]) out.push({ level: m[1].length, text: (m[2] ?? '').trim(), line: l.line });
  }
  return out;
}

export const noH1: LintRule = {
  id: 'clavis/no-h1',
  severity: 'warning',
  blocking: false,
  check({ lines }) {
    return headings(lines)
      .filter((h) => h.level === 1)
      .map((h) => ({
        line: h.line,
        message: 'Do not use H1 in the body; the page title is the H1.',
      }));
  },
};

export const headingIncrement: LintRule = {
  id: 'clavis/heading-increment',
  severity: 'warning',
  blocking: false,
  check({ lines }) {
    const out: RuleViolation[] = [];
    // The page title acts as H1, so the body may start at H2.
    let prev = 1;
    for (const h of headings(lines)) {
      if (h.level > prev + 1) {
        out.push({
          line: h.line,
          message: `Heading level jumps from H${prev} to H${h.level}.`,
          params: { from: prev, to: h.level },
        });
      }
      prev = h.level;
    }
    return out;
  },
};
