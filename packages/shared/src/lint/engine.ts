import { splitFrontmatter } from '../markdown/frontmatter';
import { scanLines } from '../markdown/lines';
import { FrontmatterSchema } from '../schema/frontmatter';
import type { Violation } from '../schema/problem';
import { attachmentExists } from './rules/attachment-exists';
import { frontmatterRequired } from './rules/frontmatter-required';
import { headingIncrement, noH1 } from './rules/headings';
import { codeLang, docLength, imageAlt } from './rules/info-rules';
import { requiredSectionsRule } from './rules/required-sections';
import { wikiLinkExists } from './rules/wiki-link-exists';
import type { LintDocument, LintEnv, LintRule } from './types';

export const DEFAULT_RULES: readonly LintRule[] = [
  frontmatterRequired,
  attachmentExists,
  noH1,
  headingIncrement,
  wikiLinkExists,
  requiredSectionsRule,
  imageAlt,
  codeLang,
  docLength,
];

export interface LintOptions extends LintEnv {
  /** Run only blocking rules, as the server does at save time. */
  blockingOnly?: boolean;
  rules?: readonly LintRule[];
}

export function parseDocument(content: string): LintDocument {
  const split = splitFrontmatter(content);
  const parsed =
    split.raw !== null && !split.error ? FrontmatterSchema.safeParse(split.data) : null;
  return {
    content,
    split,
    lines: scanLines(split.body, split.bodyStartLine),
    frontmatter: parsed?.success ? parsed.data : null,
  };
}

export function lint(content: string, options: LintOptions = {}): Violation[] {
  const { blockingOnly = false, rules = DEFAULT_RULES, ...env } = options;
  const doc = parseDocument(content);
  const out: Violation[] = [];
  for (const rule of rules) {
    if (blockingOnly && !rule.blocking) continue;
    for (const v of rule.check(doc, env)) {
      out.push({ ruleId: rule.id, severity: rule.severity, ...v });
    }
  }
  return out.sort((a, b) => a.line - b.line || (a.column ?? 0) - (b.column ?? 0));
}

export function hasErrors(violations: readonly Violation[]): boolean {
  return violations.some((v) => v.severity === 'error');
}
