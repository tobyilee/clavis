import { FrontmatterSchema } from '../../schema/frontmatter';
import type { LintRule, RuleViolation } from '../types';

export const frontmatterRequired: LintRule = {
  id: 'clavis/frontmatter-required',
  severity: 'error',
  blocking: true,
  check({ split }) {
    if (split.raw === null) {
      return [
        {
          line: 1,
          message: 'Document must start with YAML frontmatter.',
          params: { kind: 'missing' },
        },
      ];
    }
    if (split.error) {
      return [
        {
          line: 1,
          message: `Frontmatter is not valid YAML: ${split.error}`,
          params: { kind: 'yaml' },
        },
      ];
    }
    const result = FrontmatterSchema.safeParse(split.data ?? {});
    if (result.success) return [];

    const rawLines = split.raw.split(/\r?\n/);
    return result.error.issues.map((issue): RuleViolation => {
      const field = String(issue.path[0] ?? '');
      const idx = rawLines.findIndex((l) => l.startsWith(`${field}:`));
      return {
        // +2: line 1 is the opening '---'
        line: idx >= 0 ? idx + 2 : 1,
        message: field ? `Frontmatter field "${field}": ${issue.message}` : issue.message,
        params: { field },
      };
    });
  },
};
