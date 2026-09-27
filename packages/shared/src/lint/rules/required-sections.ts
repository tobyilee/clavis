import type { DocType } from '../../schema/frontmatter';
import type { LintConfig } from '../../schema/lint-config';
import { requiredSections } from '../../templates';
import type { LintRule } from '../types';
import { docHeadings } from './headings';

/** Compares ignoring case and spaces, so "미결사항" matches "미결 사항". */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

export interface RequiredSection {
  ko: string;
  en: string;
}

/** A type's required H2 sections: the Space's list when it sets one, else the template's. */
export function sectionsFor(type: DocType, config?: LintConfig): readonly RequiredSection[] {
  const custom = config?.requiredSections[type];
  if (custom) return custom.map((s) => ({ ko: s.ko, en: s.en ?? s.ko }));
  return requiredSections(type);
}

export const requiredSectionsRule: LintRule = {
  id: 'clavis/required-sections',
  severity: 'warning',
  check(doc, { config }) {
    const { frontmatter, split } = doc;
    if (!frontmatter) return [];
    const sections = sectionsFor(frontmatter.type, config);
    if (sections.length === 0) return [];
    const h2 = docHeadings(doc)
      .filter((h) => h.level === 2)
      .map((h) => norm(h.text));
    // Either language counts, and extra words after the name are fine: "## 설계 (v2)".
    const present = (name: string) => h2.some((h) => h.startsWith(norm(name)));
    return sections
      .filter((sec) => !present(sec.ko) && !present(sec.en))
      .map((sec) => ({
        line: split.bodyStartLine,
        message: `A ${frontmatter.type} page needs a "## ${sec.ko}" (or "## ${sec.en}") section.`,
        params: { type: frontmatter.type, section: sec.ko, sectionEn: sec.en },
      }));
  },
};
