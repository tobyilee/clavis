import { splitFrontmatter } from '../markdown/frontmatter';
import { scanLines } from '../markdown/lines';
import { FrontmatterSchema } from '../schema/frontmatter';
import {
  CONFIGURABLE_RULES,
  type ConfigurableRule,
  type LintConfig,
  type RuleLevel,
} from '../schema/lint-config';
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
  /** Run only rules that report errors under the current config. */
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
    memo: new Map(),
  };
}

/**
 * Runs the rules. Pass a LintDocument from parseDocument() when the caller needs the parsed
 * document too (the server does), so a large page is scanned only once per save.
 */
export function lint(input: string | LintDocument, options: LintOptions = {}): Violation[] {
  const { blockingOnly = false, rules = DEFAULT_RULES, ...env } = options;
  const doc = typeof input === 'string' ? parseDocument(input) : input;
  const out: Violation[] = [];
  for (const rule of rules) {
    const severity = ruleSeverity(rule, env.config);
    if (severity === 'off' || (blockingOnly && severity !== 'error')) continue;
    for (const v of rule.check(doc, env)) {
      out.push({ ruleId: rule.id, severity, ...v });
    }
  }
  return out.sort((a, b) => a.line - b.line || (a.column ?? 0) - (b.column ?? 0));
}

/**
 * A rule's severity in a Space. The engine applies it to every finding, so raising a rule
 * to error makes it block saves in the editor and on the server alike (D-47).
 */
export function ruleSeverity(rule: LintRule, config?: LintConfig): RuleLevel {
  if (!(CONFIGURABLE_RULES as readonly string[]).includes(rule.id)) return rule.severity;
  return config?.rules[rule.id as ConfigurableRule] ?? rule.severity;
}

export function hasErrors(violations: readonly Violation[]): boolean {
  return violations.some((v) => v.severity === 'error');
}
