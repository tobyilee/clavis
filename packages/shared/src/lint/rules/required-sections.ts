import { requiredSections } from '../../templates';
import type { LintRule } from '../types';
import { docHeadings } from './headings';

/** Compares ignoring case and spaces, so "미결사항" matches "미결 사항". */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

export const requiredSectionsRule: LintRule = {
  id: 'clavis/required-sections',
  severity: 'warning',
  blocking: false,
  check(doc) {
    const { frontmatter, split } = doc;
    if (!frontmatter) return [];
    const sections = requiredSections(frontmatter.type);
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
