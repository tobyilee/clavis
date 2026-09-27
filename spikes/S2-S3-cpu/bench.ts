import { hasErrors, lint } from '@clavis/shared/lint';
import { extractWikiLinks, scanLines, splitFrontmatter } from '@clavis/shared/markdown';
import { lint as markdownlint } from 'markdownlint/sync';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { generateDoc } from './gen.ts';

const attachmentExists = () => true;
const resolveLink = () => true;

/** S2: what the server runs on every save (D-27). No AST. */
function savePipeline(content: string) {
  const violations = lint(content, { blockingOnly: true, attachmentExists });
  if (hasErrors(violations)) throw new Error('unexpected error');
  const { body, bodyStartLine } = splitFrontmatter(content);
  return extractWikiLinks(scanLines(body, bodyStartLine)).length;
}

const processor = unified().use(remarkParse).use(remarkGfm);

/** S3: full lint = Clavis rules + mdast parse + markdownlint. */
function fullLint(content: string) {
  const clavis = lint(content, { attachmentExists, resolveLink });
  const tree = processor.parse(content);
  const ml = markdownlint({ strings: { doc: content }, config: { default: true, MD013: false } });
  return clavis.length + tree.children.length + (ml.doc?.length ?? 0);
}

function measure(fn: (s: string) => unknown, input: string, runs: number) {
  const cold0 = performance.now();
  fn(input);
  const cold = performance.now() - cold0;
  for (let i = 0; i < 20; i++) fn(input); // warm-up
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn(input);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const pct = (p: number) =>
    samples[Math.min(samples.length - 1, Math.floor(samples.length * p))] ?? 0;
  return { cold, p50: pct(0.5), p95: pct(0.95), max: samples.at(-1) ?? 0 };
}

const fmt = (n: number) => `${n.toFixed(2).padStart(7)}ms`;
console.log(`node ${process.version}`);
console.log('scenario      size    cold       p50        p95        max');
for (const kb of [10, 50, 100, 200]) {
  const doc = generateDoc(kb * 1024);
  for (const [name, fn] of [
    ['S2 save', savePipeline],
    ['S3 full', fullLint],
  ] as const) {
    const r = measure(fn, doc, 100);
    console.log(
      `${name.padEnd(10)} ${String(kb).padStart(4)}KB ${fmt(r.cold)} ${fmt(r.p50)} ${fmt(r.p95)} ${fmt(r.max)}`,
    );
  }
}
