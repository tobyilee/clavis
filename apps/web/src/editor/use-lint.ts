import { lint } from '@clavis/shared/lint';
import type { Violation } from '@clavis/shared/schema';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TreeIndex } from '@/lib/queries';
import { markdownlintViolations } from './markdownlint';

/**
 * Runs the same Clavis rules the server runs at save time (so a save never surprises), plus
 * markdownlint style rules that only the browser can afford (D-27). Debounced while typing.
 */
export function useLint(
  content: string,
  opts: { spaceKey: string; tree: TreeIndex | null; attachments: string[] | null; self?: string },
): Violation[] {
  const [violations, setViolations] = useState<Violation[]>([]);
  const { spaceKey, tree, attachments, self } = opts;
  useEffect(() => {
    const timer = setTimeout(() => {
      const clavis = lint(content, {
        // Other spaces are checked by the server on save; locally only this space's tree is known.
        resolveLink: tree
          ? (key, title) =>
              (key !== null && key !== spaceKey) || title === self || tree.byTitle.has(title)
          : undefined,
        attachmentExists: attachments ? (name) => attachments.includes(name) : undefined,
      });
      let style: Violation[] = [];
      try {
        style = markdownlintViolations(content);
      } catch {
        // A style checker bug must never block editing.
      }
      setViolations(
        [...clavis, ...style].sort((a, b) => a.line - b.line || (a.column ?? 0) - (b.column ?? 0)),
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [content, spaceKey, tree, attachments, self]);
  return violations;
}

/** Localized message for a violation: by rule id and params (D-41), English as fallback. */
export function useViolationMessage() {
  const { t } = useTranslation();
  return useMemo(
    () => (v: Violation) => {
      if (!v.ruleId.startsWith('clavis/')) return v.message;
      let key = v.ruleId.slice('clavis/'.length);
      if (key === 'frontmatter-required')
        key = v.params?.field ? 'frontmatter-field' : `frontmatter-${v.params?.kind ?? 'field'}`;
      return t(`lint.${key}`, { ...v.params, defaultValue: v.message });
    },
    [t],
  );
}
