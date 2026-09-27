import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from './helpers';

const match = async (q: string) =>
  (
    await env.DB.prepare(
      'SELECT p.short_id AS id FROM pages_fts f JOIN pages p ON p.rowid = f.rowid WHERE pages_fts MATCH ?',
    )
      .bind(q)
      .all<{ id: string }>()
  ).results.map((r) => r.id);

beforeEach(async () => {
  await resetDb();
  const t = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO actors (id, kind, name, role, created_at) VALUES ('a1', 'agent', 'bot', 'editor', ?)",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO spaces (id, key, name, created_at) VALUES ('s1', 'PAY', 'P', ?)",
    ).bind(t),
    env.DB.prepare(
      `INSERT INTO pages (id, short_id, space_id, position, title, slug, content, doc_type, status,
         created_by, updated_by, created_at, updated_at)
       VALUES ('p1', 'aaa111', 's1', 'a0', '결제 API 설계', 's', '비동기 승인 처리', 'spec', 'draft', 'a1', 'a1', ?, ?)`,
    ).bind(t, t),
  ]);
});

describe('pages_fts triggers (migration 0001)', () => {
  it('indexes inserts and follows updates', async () => {
    expect(await match('"비동기"')).toEqual(['aaa111']);
    await env.DB.prepare("UPDATE pages SET content = '정산 배치' WHERE id = 'p1'").run();
    expect(await match('"비동기"')).toEqual([]);
    expect(await match('"정산 배"')).toEqual(['aaa111']);
  });

  it('keeps soft-deleted pages indexed and drops hard-deleted ones', async () => {
    await env.DB.prepare("UPDATE pages SET deleted_at = 1 WHERE id = 'p1'").run();
    expect(await match('"비동기"')).toEqual(['aaa111']);
    await env.DB.prepare("DELETE FROM pages WHERE id = 'p1'").run();
    expect(await match('"비동기"')).toEqual([]);
  });
});
