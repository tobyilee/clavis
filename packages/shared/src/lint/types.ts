import type { SplitResult } from '../markdown/frontmatter';
import type { ScannedLine } from '../markdown/lines';
import type { Frontmatter } from '../schema/frontmatter';
import type { Severity, Violation } from '../schema/problem';

/** A document parsed once and shared by every rule. */
export interface LintDocument {
  content: string;
  split: SplitResult;
  lines: ScannedLine[];
  /** Validated frontmatter, or null when missing or invalid. */
  frontmatter: Frontmatter | null;
  /** Per-document results shared between rules (see memo()). */
  memo: Map<string, unknown>;
}

/**
 * Computes a derived value once per document. Several rules need the same scan (headings,
 * wiki links), and on the Worker every repeated pass over a 100KB page is CPU (H2).
 */
export function memo<T>(doc: LintDocument, key: string, compute: () => T): T {
  if (doc.memo.has(key)) return doc.memo.get(key) as T;
  const value = compute();
  doc.memo.set(key, value);
  return value;
}

export interface LintEnv {
  /** Returns true when the wiki link target exists. Omit to skip link checks. */
  resolveLink?: (spaceKey: string | null, title: string) => boolean;
  /** Returns true when the page has an attachment with this filename. Omit to skip. */
  attachmentExists?: (filename: string) => boolean;
}

export type RuleViolation = Omit<Violation, 'ruleId' | 'severity'>;

/**
 * Every rule runs on the server at save time (D-27, revised after spike S3), so rules
 * must stay cheap: line scanning and regexes only, never a full Markdown AST.
 */
export interface LintRule {
  id: string;
  severity: Severity;
  /** Blocking rules reject a save when they report an error (D-09). */
  blocking: boolean;
  check(doc: LintDocument, env: LintEnv): RuleViolation[];
}
