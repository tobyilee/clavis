import type { Violation } from '@clavis/shared/schema';
import { lint } from 'markdownlint/sync';

// Style rules run only in the browser: markdownlint builds a full Markdown AST, which costs
// far more than the Worker's 10ms CPU budget (spike S3, D-27).
const CONFIG = {
  default: true,
  // Covered by Clavis rules (reported once, with Clavis wording):
  MD001: false, // heading-increment
  MD025: false, // single H1 — the page title is the H1 (clavis/no-h1)
  MD040: false, // code-lang
  MD045: false, // image-alt
  // Not useful for a wiki:
  MD013: false, // line length
  MD041: false, // first line H1
  MD024: { siblings_only: true }, // same heading under different parents is fine
  MD033: false, // inline HTML is dropped by the renderer anyway
  MD028: false, // a blank line is how two callouts (> [!NOTE]) are kept apart
  MD060: false, // |---|---| tables are the common style
};

export function markdownlintViolations(content: string): Violation[] {
  const result = lint({ strings: { doc: content }, config: CONFIG });
  return (result.doc ?? []).map((e) => ({
    ruleId: `markdownlint/${e.ruleNames[0]}`,
    severity: 'info' as const,
    message: e.errorDetail ? `${e.ruleDescription} (${e.errorDetail})` : e.ruleDescription,
    line: e.lineNumber,
    column: e.errorRange?.[0],
  }));
}
