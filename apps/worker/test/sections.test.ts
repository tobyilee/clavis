import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { updateSection } from '../src/services/sections';
import { ADMIN, agentWithRole, call, resetDb } from './helpers';

let editor: { bearer: string };
let viewer: { bearer: string };

const FM = '---\ntype: meeting\nstatus: draft # 초안\nowner: owner@gmail.com\n---\n';
const DOC = `${FM}## 참석자\n\n- 토비\n\n## 논의 내용\n\n결제 API를 논의했다.\n\n## 결정 사항\n\n없음\n\n## 액션 아이템\n\n- 할 일 1\n`;

let pageId: string;
const sec = (s: string) => `/api/v1/pages/${pageId}/sections/${encodeURIComponent(s)}`;
const content = async () =>
  (await call(`/api/v1/pages/${pageId}`, viewer)).json as { content: string; revision: number };

beforeEach(async () => {
  await resetDb();
  editor = await agentWithRole('editor', 'hermes');
  viewer = await agentWithRole('viewer');
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'TEAM', name: '팀' } });
  const created = await call('/api/v1/spaces/TEAM/pages', {
    ...editor,
    method: 'POST',
    body: { title: '주간 회의', content: DOC },
  });
  expect(created.status).toBe(201);
  pageId = created.json.page.id;
});

describe('sections API (D-48)', () => {
  it('lists sections and reads one by id or by heading text', async () => {
    const list = await call(`/api/v1/pages/${pageId}/sections`, viewer);
    expect(list.json.revision).toBe(1);
    expect(list.json.sections.map((s: { id: string }) => s.id)).toEqual([
      '참석자',
      '논의-내용',
      '결정-사항',
      '액션-아이템',
    ]);
    const byId = await call(sec('액션-아이템'), viewer);
    expect(byId.json).toMatchObject({ revision: 1, content: '## 액션 아이템\n\n- 할 일 1\n' });
    const byText = await call(sec('## 논의 내용'), viewer);
    expect(byText.json.section).toMatchObject({ id: '논의-내용', level: 2, line: 10 });
  });

  it('replaces a section while someone else edits another one', async () => {
    const read = (await call(sec('결정-사항'), viewer)).json;
    // A person saves a change to a different section in the meantime.
    const now = await content();
    const other = await call(`/api/v1/pages/${pageId}`, {
      ...editor,
      method: 'PUT',
      body: {
        content: now.content.replace('결제 API를 논의했다.', '결제 API와 환불을 논의했다.'),
        baseRevision: now.revision,
      },
    });
    expect(other.status).toBe(200);

    const res = await call(sec('결정-사항'), {
      ...editor,
      method: 'PUT',
      body: {
        mode: 'replace',
        content: '- 환불은 3일 안에 처리',
        baseSectionHash: read.section.hash,
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.page.revision).toBe(3);
    const after = (await content()).content;
    expect(after).toContain('결제 API와 환불을 논의했다.');
    expect(after).toContain('## 결정 사항\n\n- 환불은 3일 안에 처리\n\n## 액션 아이템');
  });

  it('rejects a replace when that section changed, and keeps the page', async () => {
    const read = (await call(sec('결정-사항'), viewer)).json;
    await call(sec('결정-사항'), {
      ...editor,
      method: 'PUT',
      body: { mode: 'append', content: '- 누군가 추가' },
    });
    const res = await call(sec('결정-사항'), {
      ...editor,
      method: 'PUT',
      body: { mode: 'replace', content: '덮어쓰기', baseSectionHash: read.section.hash },
    });
    expect(res.status).toBe(409);
    expect(res.json.type).toContain('section-conflict');
    expect(res.json.detail).toContain('- 누군가 추가');
    expect((await content()).content).not.toContain('덮어쓰기');
  });

  it('needs a base for replace; a pinned revision is strict', async () => {
    const noBase = await call(sec('결정-사항'), {
      ...editor,
      method: 'PUT',
      body: { mode: 'replace', content: 'x' },
    });
    expect(noBase.status).toBe(400);
    await call(sec('참석자'), {
      ...editor,
      method: 'PUT',
      body: { mode: 'append', content: '- 민수' },
    });
    const pinned = await call(sec('결정-사항'), {
      ...editor,
      method: 'PUT',
      body: { mode: 'replace', content: 'x', baseRevision: 1 },
    });
    expect(pinned.status).toBe(409);
    expect(pinned.json).toMatchObject({ revision: 2 });
  });

  it('appends to a list, and retries once when another save lands in between', async () => {
    const actor = await env.DB.prepare("SELECT * FROM actors WHERE name = 'hermes'").first();
    // The page text is read with a single statement, then updatePage reads in batch 1 and
    // writes in batch 2: someone else's save lands right before the first write.
    let batches = 0;
    const racing = new Proxy(env.DB, {
      get(db, prop) {
        if (prop !== 'batch') return Reflect.get(db, prop).bind?.(db) ?? Reflect.get(db, prop);
        return async (stmts: D1PreparedStatement[]) => {
          if (++batches === 2) {
            await db
              .prepare(
                "UPDATE pages SET content = replace(content, '없음', '보류'), revision = revision + 1 WHERE id = ?",
              )
              .bind(pageId)
              .run();
          }
          return db.batch(stmts);
        };
      },
    });
    const result = await updateSection(racing, actor as never, pageId, '액션 아이템', {
      mode: 'append',
      content: '- 할 일 2',
    });
    expect(result.page.revision).toBe(3);
    const after = (await content()).content;
    expect(after).toContain('## 결정 사항\n\n보류\n');
    expect(after.endsWith('- 할 일 1\n- 할 일 2\n')).toBe(true);
  });

  it('explains missing and ambiguous sections', async () => {
    const missing = await call(sec('없는 섹션'), viewer);
    expect(missing.status).toBe(404);
    expect(missing.json.detail).toContain('## 액션 아이템 (id: 액션-아이템)');
    await call(sec('참석자'), {
      ...editor,
      method: 'PUT',
      body: { mode: 'append', content: '### 메모 (초안)\n\nA' },
    });
    await call(sec('결정-사항'), {
      ...editor,
      method: 'PUT',
      body: { mode: 'append', content: '### 메모 (초안)\n\nB' },
    });
    const ambiguous = await call(sec('메모 (초안)'), viewer);
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.json.detail).toContain('id: 메모-초안-1');
  });

  it('runs the normal save pipeline: lint errors block, viewers cannot write', async () => {
    const bad = await call(sec('결정-사항'), {
      ...editor,
      method: 'PUT',
      body: { mode: 'append', content: '![도표](attachments/없음.png)' },
    });
    expect(bad.status).toBe(422);
    expect(bad.json.violations[0].ruleId).toBe('clavis/attachment-exists');
    const denied = await call(sec('결정-사항'), {
      ...viewer,
      method: 'PUT',
      body: { mode: 'append', content: 'x' },
    });
    expect(denied.status).toBe(403);
  });
});

describe('PATCH /pages/{ref}/meta', () => {
  it('sets status, owner and tags in the frontmatter, keeping comments', async () => {
    const res = await call(`/api/v1/pages/${pageId}/meta`, {
      ...editor,
      method: 'PATCH',
      body: { status: 'review', tags: ['결제', 'weekly'] },
    });
    expect(res.status).toBe(200);
    expect(res.json.page).toMatchObject({
      status: 'review',
      tags: ['weekly', '결제'],
      revision: 2,
    });
    expect(
      (await content()).content.startsWith(
        '---\ntype: meeting\nstatus: review # 초안\nowner: owner@gmail.com\ntags: [ 결제, weekly ]\n---\n',
      ),
    ).toBe(true);
  });

  it('validates values and needs at least one field', async () => {
    const bad = await call(`/api/v1/pages/${pageId}/meta`, {
      ...editor,
      method: 'PATCH',
      body: { status: 'done' },
    });
    expect(bad.status).toBe(400);
    const empty = await call(`/api/v1/pages/${pageId}/meta`, {
      ...editor,
      method: 'PATCH',
      body: {},
    });
    expect(empty.status).toBe(400);
  });
});
