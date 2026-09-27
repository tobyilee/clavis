import { type ReactNode, useEffect, useState } from 'react';

// Loaded lazily with Shiki itself: pages without code never download either (D-40).
let highlighter: Promise<typeof import('shiki')> | null = null;
const cache = new Map<string, string>();

export default function CodeBlock({
  code,
  lang,
  line,
  fallback,
}: {
  code: string;
  lang: string;
  line?: number;
  fallback: ReactNode;
}) {
  const key = `${lang}\u0000${code}`;
  const [html, setHtml] = useState(() => cache.get(key) ?? null);

  useEffect(() => {
    if (!lang || cache.has(key)) return;
    let cancelled = false;
    highlighter ??= import('shiki');
    highlighter
      .then((shiki) =>
        shiki.codeToHtml(code, {
          lang,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        }),
      )
      .then((out) => {
        cache.set(key, out);
        if (!cancelled) setHtml(out);
      })
      // Unknown language: keep the plain block.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code, lang, key]);

  if (!html) return <>{fallback}</>;
  // Shiki escapes the code; the markup is its own spans.
  // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki output
  return <div className="code-block" data-line={line} dangerouslySetInnerHTML={{ __html: html }} />;
}
