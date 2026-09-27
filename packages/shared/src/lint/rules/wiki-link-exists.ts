import { extractWikiLinks } from '../../markdown/links';
import { type LintDocument, type LintRule, memo } from '../types';

/** The document's wiki links, extracted once (the Worker also stores them as page_links). */
export const docWikiLinks = (doc: LintDocument) =>
  memo(doc, 'wikiLinks', () => extractWikiLinks(doc.lines));

export const wikiLinkExists: LintRule = {
  id: 'clavis/wiki-link-exists',
  severity: 'warning',
  blocking: false,
  check(doc, { resolveLink }) {
    if (!resolveLink) return [];
    return docWikiLinks(doc)
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
