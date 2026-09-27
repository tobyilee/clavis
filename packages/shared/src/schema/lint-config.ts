import { z } from 'zod';
import { DOC_TYPES } from './frontmatter';

/** A rule's level in a Space: its severity, or off (D-47). */
export const RULE_LEVELS = ['off', 'info', 'warning', 'error'] as const;
export type RuleLevel = (typeof RULE_LEVELS)[number];

/**
 * Rules a Space may retune. clavis/frontmatter-required is not here: the type and status
 * columns come from the frontmatter, so it always blocks (D-47).
 */
export const CONFIGURABLE_RULES = [
  'clavis/attachment-exists',
  'clavis/no-h1',
  'clavis/heading-increment',
  'clavis/wiki-link-exists',
  'clavis/required-sections',
  'clavis/image-alt',
  'clavis/code-lang',
  'clavis/doc-length',
] as const;
export type ConfigurableRule = (typeof CONFIGURABLE_RULES)[number];

export const SectionNameSchema = z.object({
  ko: z.string().trim().min(1).max(60),
  /** Alternative name that also satisfies the rule; defaults to `ko`. */
  en: z.string().trim().min(1).max(60).optional(),
});
export type SectionName = z.infer<typeof SectionNameSchema>;

export const LintConfigSchema = z
  .object({
    rules: z.partialRecord(z.enum(CONFIGURABLE_RULES), z.enum(RULE_LEVELS)).default({}),
    /** Replaces a type's required H2 sections; an empty list means none. */
    requiredSections: z
      .partialRecord(z.enum(DOC_TYPES), z.array(SectionNameSchema).max(20))
      .default({}),
    /** clavis/doc-length threshold in KB (the page cap is 100KB, D-33). */
    docLengthKb: z.number().int().min(5).max(100).optional(),
  })
  .strict();
export type LintConfig = z.infer<typeof LintConfigSchema>;
