import { extractWikiLinks } from '../../markdown/links';
import type { LintRule } from '../types';

export const wikiLinkExists: LintRule = {
  id: 'clavis/wiki-link-exists',
  severity: 'warning',
  blocking: false,
  check({ lines }, { resolveLink }) {
    if (!resolveLink) return [];
    return extractWikiLinks(lines)
      .filter((link) => !resolveLink(link.spaceKey, link.title))
      .map((link) => {
        const target = link.spaceKey ? `${link.spaceKey}:${link.title}` : link.title;
        return {
          line: link.line,
          column: link.column,
          message: `Linked page "${target}" does not exist.`,
          params: { target },
        };
      });
  },
};
