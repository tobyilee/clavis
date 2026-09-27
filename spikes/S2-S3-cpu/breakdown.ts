import { lint } from '@clavis/shared/lint';
import { lint as markdownlint } from 'markdownlint/sync';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { generateDoc } from './gen.ts';

const processor = unified().use(remarkParse).use(remarkGfm);
const parts = {
  'clavis rules (all, no AST)': (s: string) =>
    lint(s, { attachmentExists: () => true, resolveLink: () => true }),
  'remark parse + gfm': (s: string) => processor.parse(s),
  'markdownlint (default)': (s: string) =>
    markdownlint({ strings: { doc: s }, config: { default: true, MD013: false } }),
};

function p50(fn: (s: string) => unknown, s: string) {
  for (let i = 0; i < 10; i++) fn(s);
  const xs: number[] = [];
  for (let i = 0; i < 40; i++) {
    const t = performance.now();
    fn(s);
    xs.push(performance.now() - t);
  }
  return xs.sort((a, b) => a - b)[20] ?? 0;
}

for (const kb of [10, 50, 100]) {
  const doc = generateDoc(kb * 1024);
  const row = Object.entries(parts).map(([k, fn]) => `${k}: ${p50(fn, doc).toFixed(2)}ms`);
  console.log(`${kb}KB  ${row.join('  |  ')}`);
}
