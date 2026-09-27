export interface ScannedLine {
  text: string;
  /** 1-based line number in the full document. */
  line: number;
  /** True for lines inside a fenced code block, including the fence lines themselves. */
  inFence: boolean;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** Splits a Markdown body into lines, tracking fenced code blocks. Cheap: no AST. */
export function scanLines(body: string, startLine = 1): ScannedLine[] {
  const out: ScannedLine[] = [];
  let fence: string | null = null;
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? '';
    const m = FENCE_RE.exec(text);
    if (fence === null && m?.[1]) {
      fence = m[1];
      out.push({ text, line: startLine + i, inFence: true });
      continue;
    }
    if (fence !== null) {
      if (m?.[1] && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      out.push({ text, line: startLine + i, inFence: true });
      continue;
    }
    out.push({ text, line: startLine + i, inFence: false });
  }
  return out;
}

/** Removes inline code spans so their contents are not treated as links. */
export function stripInlineCode(text: string): string {
  return text.replace(/(`+)[^`]*?\1/g, (s) => ' '.repeat(s.length));
}
