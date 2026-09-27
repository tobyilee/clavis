import { useEffect, useId, useState } from 'react';

let loader: Promise<typeof import('mermaid')['default']> | null = null;

function loadMermaid() {
  loader ??= import('mermaid').then(({ default: mermaid }) => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    // strict: no clicks or scripts in diagrams, labels are sanitized.
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
    });
    return mermaid;
  });
  return loader;
}

export default function Mermaid({ code, line }: { code: string; line?: number }) {
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then(({ svg: out }) => {
        if (!cancelled) {
          setSvg(out);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <div className="mermaid-error" data-line={line}>
        <p>Mermaid: {error}</p>
        <pre>{code}</pre>
      </div>
    );
  }
  if (!svg) return <pre data-line={line}>{code}</pre>;
  // Rendered by Mermaid with securityLevel 'strict' (labels sanitized, no script hooks).
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized Mermaid SVG
  return <div className="mermaid" data-line={line} dangerouslySetInnerHTML={{ __html: svg }} />;
}
