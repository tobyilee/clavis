import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { runBackupStep } from '../src/backup/backup';

/** Reads a tar archive, applying PAX "path" overrides. */
function readTar(buf: Uint8Array): Map<string, string> {
  const dec = new TextDecoder();
  const files = new Map<string, string>();
  let off = 0;
  let paxPath: string | null = null;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const name = dec.decode(h.subarray(0, 100)).replace(/\0.*$/s, '');
    const size = Number.parseInt(dec.decode(h.subarray(124, 136)).replace(/\0.*$/s, '').trim(), 8);
    const type = String.fromCharCode(h[156] ?? 0);
    const data = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      paxPath = /\d+ path=(.*)\n/.exec(dec.decode(data))?.[1] ?? null;
      continue;
    }
    files.set(paxPath ?? name, dec.decode(data));
    paxPath = null;
  }
  return files;
}

const NOW = new Date('2026-09-27T18:00:00Z');

beforeEach(async () => {
  // Storage is isolated per test file, not per test, so reset it explicitly.
  await env.DB.batch(
    ['attachments', 'page_links', 'page_tags', 'pages', 'spaces', 'api_tokens', 'actors'].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
  const existing = await env.FILES.list();
  if (existing.objects.length > 0) await env.FILES.delete(existing.objects.map((o) => o.key));

  const t = NOW.getTime();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO actors (id, kind, name, email, role, created_at) VALUES ('a1','human','토비','toby@team.dev','admin',?)",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO spaces (id, key, name, created_at) VALUES ('s1','PAY','결제',?)",
    ).bind(t),
    ...[
      ['p1', 'aaa111', null, 'a0', '설계', null],
      ['p2', 'bbb222', 'p1', 'a0', '결제 API/v2 설계', null],
      ['p3', 'ccc333', null, 'a1', 'Old note', t],
    ].map(([id, sid, parent, pos, title, deleted]) =>
      env.DB.prepare(
        `INSERT INTO pages (id, short_id, space_id, parent_id, position, title, slug, content, doc_type, status,
           created_by, updated_by, created_at, updated_at, deleted_at)
         VALUES (?, ?, 's1', ?, ?, ?, 'slug', ?, 'spec', 'draft', 'a1', 'a1', ?, ?, ?)`,
      ).bind(id, sid, parent, pos, title, `---\ntype: spec\n---\n## ${title}\n`, t, t, deleted),
    ),
  ]);
  await env.FILES.put('backup/2026-09-01.tar', 'old');
  await env.FILES.put('backup/2026-09-20.tar', 'recent');
});

async function runToCompletion(now: Date, chunkBytes: number) {
  const steps = [];
  for (let i = 0; i < 20; i++) {
    const step = await runBackupStep(env, now, chunkBytes);
    steps.push(step);
    if (step.state.done) return steps;
  }
  throw new Error('backup did not finish');
}

async function extractAll(prefix: string) {
  const files = new Map<string, string>();
  const { objects } = await env.FILES.list({ prefix });
  for (const o of objects.filter((x) => x.key.endsWith('.tar'))) {
    const obj = await env.FILES.get(o.key);
    if (!obj) throw new Error(`missing ${o.key}`);
    for (const [k, v] of readTar(new Uint8Array(await obj.arrayBuffer()))) files.set(k, v);
  }
  return files;
}

describe('runBackupStep', () => {
  it('splits pages into tar parts by size and rebuilds the tree when combined', async () => {
    // Each page is ~40 bytes, so a 1-byte budget forces one page per part.
    const steps = await runToCompletion(NOW, 1);
    expect(steps.map((s) => s.wrote)).toEqual([
      'backup/2026-09-27/part-001.tar',
      'backup/2026-09-27/part-002.tar',
      'backup/2026-09-27/part-003.tar',
    ]);
    expect(steps.at(-1)?.state).toMatchObject({ done: true, pages: 3, parts: 3 });

    const files = await extractAll('backup/2026-09-27/');
    expect([...files.keys()].sort()).toEqual([
      'PAY/_trash/Old note--ccc333.md',
      'PAY/설계--aaa111.md',
      'PAY/설계--aaa111/결제 API_v2 설계--bbb222.md',
    ]);
    expect(files.get('PAY/설계--aaa111/결제 API_v2 설계--bbb222.md')).toContain(
      '## 결제 API/v2 설계',
    );

    const metaObj = await env.FILES.get('backup/2026-09-27/meta.json');
    const meta = JSON.parse((await metaObj?.text()) ?? '{}');
    expect(meta).toMatchObject({ format: 'clavis-backup', version: 2, parts: 3 });
    expect(meta.pages).toHaveLength(3);
    expect(meta.pages[0]).not.toHaveProperty('content');
    expect(meta.actors[0]).not.toHaveProperty('token_hash');
  });

  it('fits everything in one part when the budget allows', async () => {
    const steps = await runToCompletion(NOW, 1_000_000);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.state).toMatchObject({ done: true, pages: 3, parts: 1 });
  });

  it('is a no-op once tonight is finished', async () => {
    await runToCompletion(NOW, 1_000_000);
    const again = await runBackupStep(env, NOW);
    expect(again.wrote).toBeNull();
  });

  it('prunes backup folders older than the retention window', async () => {
    const steps = await runToCompletion(NOW, 1_000_000);
    expect(steps.at(-1)?.pruned).toEqual(['backup/2026-09-01.tar']);
    const left = (await env.FILES.list({ prefix: 'backup/' })).objects.map((o) => o.key);
    expect(left).toContain('backup/2026-09-20.tar');
  });
});
