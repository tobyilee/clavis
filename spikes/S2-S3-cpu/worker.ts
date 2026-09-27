// Throwaway Worker for measuring real CPU time on Cloudflare (spike S2/S3).
// cpuTime is read from `wrangler tail`; Workers freeze timers during CPU work.
import { hasErrors, lint } from '@clavis/shared/lint';
import { extractWikiLinks, scanLines, splitFrontmatter } from '@clavis/shared/markdown';
import { lint as markdownlint } from 'markdownlint/sync';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { generateDoc } from './gen.ts';

// Built at module load, which runs under the startup budget rather than the per-request limit.
const docs = new Map([10, 50, 100].map((kb) => [kb, generateDoc(kb * 1024)] as const));
const doc = (kb: number) => docs.get(kb) ?? '';
const processor = unified().use(remarkParse).use(remarkGfm);
const yes = () => true;

const modes: Record<string, (s: string) => unknown> = {
  none: () => 0,
  save: (s) => {
    const v = lint(s, { attachmentExists: yes, resolveLink: yes });
    const { body, bodyStartLine } = splitFrontmatter(s);
    return hasErrors(v) || extractWikiLinks(scanLines(body, bodyStartLine)).length;
  },
  remark: (s) => processor.parse(s),
  markdownlint: (s) => markdownlint({ strings: { d: s }, config: { default: true, MD013: false } }),
};

export default {
  fetch(req: Request) {
    const url = new URL(req.url);
    const kb = Number(url.searchParams.get('kb') ?? 10);
    const mode = url.searchParams.get('mode') ?? 'none';
    const input = doc(kb);
    const fn = modes[mode];
    if (!fn) return new Response('bad mode', { status: 400 });
    fn(input);
    return new Response(`${mode} ${kb}KB ok`);
  },
};
