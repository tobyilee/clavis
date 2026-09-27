import type { Element } from 'hast';
import type { Components } from 'hast-util-to-jsx-runtime';
import { lazy, Suspense } from 'react';
import { MarkdownLink } from './link';
import { textOf } from './plugins';

const CodeBlock = lazy(() => import('./code-block'));
const Mermaid = lazy(() => import('./mermaid'));

/** <pre><code class="language-x"> → highlighted code, or a Mermaid diagram. */
function Pre({ node, children, ...rest }: { node?: Element; children?: React.ReactNode }) {
  const code = node?.children.find(
    (c): c is Element => c.type === 'element' && c.tagName === 'code',
  );
  const cls = code?.properties.className;
  const lang = Array.isArray(cls)
    ? String(cls.find((c) => String(c).startsWith('language-')) ?? '').slice('language-'.length)
    : '';
  const source = code ? textOf(code).replace(/\n$/, '') : '';
  const line = node?.properties.dataLine as number | undefined;
  const plain = (
    <pre data-line={line} {...rest}>
      {children}
    </pre>
  );
  if (!code) return plain;
  return (
    <Suspense fallback={plain}>
      {lang === 'mermaid' ? (
        <Mermaid code={source} line={line} />
      ) : (
        <CodeBlock code={source} lang={lang} line={line} fallback={plain} />
      )}
    </Suspense>
  );
}

export const markdownComponents: Partial<Components> = {
  pre: Pre,
  a: MarkdownLink,
  table: ({ node: _node, ...props }) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
};
