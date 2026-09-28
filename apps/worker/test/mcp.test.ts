import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

const MCP_HEADERS = { accept: 'application/json, text/event-stream' };

async function rpc(
  method: string,
  params: unknown,
  auth: { as?: string; bearer?: string },
  id = 1,
) {
  return call('/mcp', {
    ...auth,
    method: 'POST',
    headers: MCP_HEADERS,
    body: { jsonrpc: '2.0', id, method, params },
  });
}

/** Calls a tool; returns its text and whether it reported an error. */
async function tool(auth: { bearer: string }, name: string, args: Record<string, unknown> = {}) {
  const res = await rpc('tools/call', { name, arguments: args }, auth);
  expect(res.status).toBe(200);
  const result = res.json.result;
  return { text: result.content[0].text as string, isError: result.isError === true };
}

let editor: { bearer: string };

beforeEach(async () => {
  await resetDb();
  editor = await agentWithRole('editor', 'hermes');
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
});

describe('MCP endpoint', () => {
  it('initializes with instructions and lists every tool for an editor', async () => {
    const init = await rpc(
      'initialize',
      {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
      editor,
    );
    expect(init.status).toBe(200);
    expect(init.json.result.serverInfo.name).toBe('clavis');
    expect(init.json.result.instructions).toContain('baseRevision');

    const tools = await rpc('tools/list', {}, editor, 2);
    expect(tools.json.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'add_comment',
      'create_page',
      'delete_page',
      'get_backlinks',
      'get_space_health',
      'get_space_tree',
      'lint_markdown',
      'list_comments',
      'list_notifications',
      'list_revisions',
      'list_sections',
      'list_spaces',
      'list_templates',
      'mark_notifications_read',
      'move_page',
      'read_page',
      'read_revision',
      'read_section',
      'resolve_comment',
      'restore_revision',
      'search_pages',
      'semantic_search',
      'set_page_meta',
      'update_page',
      'update_section',
    ]);
  });

  it('hides write tools from viewer agents', async () => {
    const viewer = await agentWithRole('viewer');
    const tools = await rpc('tools/list', {}, viewer);
    const names = tools.json.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('search_pages');
    expect(names).not.toContain('create_page');
    expect(names).not.toContain('resolve_comment');
    expect(names).not.toContain('restore_revision');
    expect(names).toContain('list_revisions');
    // Viewers may comment (D-45).
    expect(names).toContain('add_comment');
    const res = await rpc('tools/call', { name: 'create_page', arguments: {} }, viewer);
    expect(res.json.result?.isError ?? res.json.error).toBeTruthy();
  });

  it('rejects unauthenticated and pending callers before reaching MCP', async () => {
    expect((await rpc('tools/list', {}, {})).status).toBe(401);
    const pending = await rpc('tools/list', {}, { as: 'stranger@gmail.com' });
    expect(pending.status).toBe(403);
  });
});

describe('agent workflow (plan M1)', () => {
  it('creates from a template, searches, reads, updates with the revision', async () => {
    const created = await tool(editor, 'create_page', {
      space: 'PAY',
      title: '주간 회의 2026-09-27',
      template: 'meeting',
    });
    expect(created.isError).toBe(false);
    const shortId = /PAY\/([0-9a-z]{6})/.exec(created.text)?.[1] ?? '';
    expect(created.text).toContain('revision=1');
    expect(created.text).toContain(`https://clavis.test/s/PAY/p/`);

    const tree = JSON.parse((await tool(editor, 'get_space_tree', { space: 'PAY' })).text);
    expect(tree.map((n: { title: string }) => n.title)).toEqual(['결제', '주간 회의 2026-09-27']);
    expect(Object.keys(tree[1]).sort()).toEqual([
      'children',
      'docType',
      'shortId',
      'status',
      'title',
    ]);

    const found = await tool(editor, 'search_pages', { query: '액션 아이템' });
    expect(found.text).toContain(`PAY/${shortId}`);
    expect(found.text).toContain('**액션** **아이템**');

    const read = await tool(editor, 'read_page', { page: 'PAY:주간 회의 2026-09-27' });
    expect(read.text).toMatch(/revision=1 updated_by=hermes/);
    const content = read.text
      .split('\n')
      .slice(1)
      .join('\n')
      .replace('## 결정 사항\n', '## 결정 사항\n\n- MCP 쓰기 도구 배포\n');

    const updated = await tool(editor, 'update_page', { page: shortId, content, baseRevision: 1 });
    expect(updated.text).toContain('revision=2');

    const stale = await tool(editor, 'update_page', { page: shortId, content, baseRevision: 1 });
    expect(stale.isError).toBe(true);
    expect(stale.text).toContain('Current revision is 2');
    expect(stale.text).toContain('read_page');
  });

  it('reports lint errors with line numbers and saves nothing', async () => {
    const res = await tool(editor, 'create_page', {
      space: 'PAY',
      title: '초안',
      content: '---\ntype: memo\nstatus: draft\nowner: hermes\n---\n',
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('Nothing was saved');
    expect(res.text).toMatch(/- L2 error clavis\/frontmatter-required/);
  });

  it('reports warnings but saves', async () => {
    const res = await tool(editor, 'create_page', {
      space: 'PAY',
      title: '노트',
      content: `${FM()}# 제목\n[[없는 문서]]\n`,
    });
    expect(res.isError).toBe(false);
    expect(res.text).toContain('Warnings (2), saved anyway');
    expect(res.text).toContain('clavis/wiki-link-exists');
  });

  it('shows who changed a page and brings an old text back (D-54, D-56)', async () => {
    const created = await tool(editor, 'create_page', {
      space: 'PAY',
      title: '정책',
      content: `${FM()}좋은 본문\n`,
    });
    const id = /PAY\/([0-9a-z]{6})/.exec(created.text)?.[1];
    await tool(editor, 'update_page', {
      page: id,
      content: `${FM()}망가진 본문\n`,
      baseRevision: 1,
    });

    const list = await tool(editor, 'list_revisions', { page: id });
    expect(list.text).toMatch(/^- r2 \S+ hermes \(agent\) update \d+B "정책"\n- r1 .* create /);
    const old = await tool(editor, 'read_revision', { page: id, revision: 1 });
    expect(old.text).toContain('<!-- clavis revision: r1 of r2 by hermes create "정책" -->');
    expect(old.text).toContain('좋은 본문');

    const restored = await tool(editor, 'restore_revision', { page: id, revision: 1 });
    expect(restored.text).toContain(`Restored r1 as PAY/${id} "정책" revision=3`);
    expect((await tool(editor, 'read_page', { page: id })).text).toContain('좋은 본문');
    const again = await tool(editor, 'restore_revision', { page: id, revision: 3 });
    expect(again).toMatchObject({ isError: true });
    expect(again.text).toContain('current one');
  });

  it("follows the space's rules and custom templates (D-47, D-49)", async () => {
    await call('/api/v1/spaces/PAY/lint-config', {
      ...ADMIN,
      method: 'PUT',
      body: { rules: { 'clavis/no-h1': 'error' } },
    });
    const made = await call('/api/v1/templates', {
      ...ADMIN,
      method: 'POST',
      body: {
        space: 'PAY',
        name: '장애 보고',
        content: '---\ntype: note\nstatus: draft\nowner: {{owner}}\n---\n## 타임라인\n',
      },
    });
    expect(made.status).toBe(201);

    const templates = JSON.parse((await tool(editor, 'list_templates', { space: 'PAY' })).text);
    expect(templates[0]).toMatchObject({ id: made.json.id, name: '장애 보고' });
    const created = await tool(editor, 'create_page', {
      space: 'PAY',
      title: '9/28 장애',
      template: made.json.id,
    });
    expect(created.isError).toBe(false);
    const read = await tool(editor, 'read_page', { page: 'PAY:9/28 장애' });
    expect(read.text).toContain('owner: hermes\n---\n## 타임라인\n');

    // An H1 is an error in this space: the draft check and the save both say so.
    const lint = await tool(editor, 'lint_markdown', { content: `${FM()}# 제목\n`, space: 'PAY' });
    expect(lint.text).toMatch(/- L\d+ error clavis\/no-h1/);
    const blocked = await tool(editor, 'create_page', {
      space: 'PAY',
      title: '제목 있음',
      content: `${FM()}# 제목\n`,
    });
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toContain('Nothing was saved');
  });

  it('edits one section and the status without sending the page (D-48)', async () => {
    const created = await tool(editor, 'create_page', {
      space: 'PAY',
      title: '회의',
      template: 'meeting',
    });
    const id = /PAY\/(\w+)/.exec(created.text)?.[1];
    const list = (await tool(editor, 'list_sections', { page: id })).text;
    expect(list).toMatch(/^revision=1\n/);
    expect(list).toMatch(/- ## 액션 아이템 {2}id=액션-아이템 lines=\d+-\d+ hash=[0-9a-f]{8}/);

    const read = (await tool(editor, 'read_section', { page: id, section: '결정 사항' })).text;
    const hash = /hash=([0-9a-f]{8})/.exec(read)?.[1];
    expect(read).toContain('## 결정 사항');

    const appended = await tool(editor, 'update_section', {
      page: id,
      section: '액션-아이템',
      mode: 'append',
      content: '- [ ] 환불 정책 초안 (hermes)',
    });
    expect(appended.isError).toBe(false);
    expect(appended.text).toMatch(/^Updated section "액션-아이템" of PAY\/\w+ "회의" revision=2/);

    // Unrelated to the appended section, so the old hash still holds.
    const replaced = await tool(editor, 'update_section', {
      page: id,
      section: '결정 사항',
      mode: 'replace',
      content: '- 환불은 3일 안에',
      baseSectionHash: hash,
    });
    expect(replaced.isError).toBe(false);
    const stale = await tool(editor, 'update_section', {
      page: id,
      section: '결정 사항',
      mode: 'replace',
      content: '덮어쓰기',
      baseSectionHash: hash,
    });
    expect(stale).toMatchObject({ isError: true });
    expect(stale.text).toContain('- 환불은 3일 안에');
    expect(stale.text).toContain('Reapply your edit');
    const blind = await tool(editor, 'update_section', {
      page: id,
      section: '결정 사항',
      mode: 'replace',
      content: 'x',
    });
    expect(blind).toMatchObject({ isError: true });

    const meta = await tool(editor, 'set_page_meta', { page: id, status: 'review' });
    expect(meta.text).toContain('revision=4');
    const page = (await tool(editor, 'read_page', { page: id })).text;
    expect(page).toContain('status: review');
    expect(page).toContain('- [ ] 환불 정책 초안 (hermes)');
  });

  it('reads, answers and resolves review comments (D-53)', async () => {
    const created = await tool(editor, 'create_page', {
      space: 'PAY',
      title: '검토 문서',
      content: `${FM()}## 범위\n\n본문\n`,
    });
    const id = /PAY\/(\w+)/.exec(created.text)?.[1] ?? '';
    const q = await call(`/api/v1/pages/${id}/comments`, {
      ...ADMIN,
      method: 'POST',
      body: { body: '범위에\n환불도 넣어 주세요', sectionId: '범위' },
    });
    expect((await tool(editor, 'read_page', { page: id })).text).toContain('open_comments=1');
    const list = (await tool(editor, 'list_comments', { page: id })).text;
    expect(list).toBe(`- [${q.json.id}] owner on #범위: 범위에\n    환불도 넣어 주세요`);

    const reply = await tool(editor, 'add_comment', {
      page: id,
      body: '환불을 범위에 추가했습니다.',
      replyTo: q.json.id,
    });
    expect(reply.text).toMatch(new RegExp(`in thread ${q.json.id}\\.$`));
    expect((await tool(editor, 'resolve_comment', { comment: q.json.id })).text).toBe(
      `Thread ${q.json.id} resolved.`,
    );
    expect((await tool(editor, 'list_comments', { page: id })).text).toBe('No open comments.');
    const all = (await tool(editor, 'list_comments', { page: id, includeResolved: true })).text;
    expect(all).toContain('(resolved)');
    expect(all).toContain('  - [');
    expect(all).toContain('hermes (agent): 환불을 범위에 추가했습니다.');
  });

  it('reports backlinks and space health', async () => {
    const created = await tool(editor, 'create_page', {
      space: 'PAY',
      title: '정책',
      content: `${FM()}본문\n`,
    });
    const target = /PAY\/(\w+)/.exec(created.text)?.[1];
    await tool(editor, 'create_page', {
      space: 'PAY',
      title: '안내',
      content: `${FM()}# 큰 제목\n\n[[정책]] [[없는 문서]]\n`,
    });
    expect((await tool(editor, 'get_backlinks', { page: target })).text).toMatch(
      /^- PAY\/\w+ "안내"$/,
    );
    const health = (await tool(editor, 'get_space_health', { space: 'PAY' })).text;
    expect(health).toContain('findings: 0 error, 1 warning, 0 info');
    expect(health).toMatch(/"안내": warning clavis\/no-h1 x1 \(L6\)/);
    expect(health).toMatch(/"안내": \[\[없는 문서\]\]/);
    // The home page predates its summary.
    expect(health).toContain('1 page(s) not yet checked');
  });

  it('lints drafts, lists templates, moves and deletes', async () => {
    const lint = await tool(editor, 'lint_markdown', {
      content: `${FM('adr')}## Context\n`,
      space: 'PAY',
    });
    expect(lint.text).toContain('Saving is allowed');
    expect(lint.text).toContain('Decision');

    const templates = JSON.parse((await tool(editor, 'list_templates', { locale: 'en' })).text);
    expect(templates.find((t: { type: string }) => t.type === 'spec').requiredSections).toContain(
      'Design',
    );

    const a = await tool(editor, 'create_page', { space: 'PAY', title: 'A', template: 'note' });
    const b = await tool(editor, 'create_page', { space: 'PAY', title: 'B', template: 'note' });
    const aId = /PAY\/([0-9a-z]{6})/.exec(a.text)?.[1];
    const bId = /PAY\/([0-9a-z]{6})/.exec(b.text)?.[1];
    const moved = await tool(editor, 'move_page', { page: bId, parent: aId });
    expect(moved.text).toBe(`Moved PAY/${bId}: A / B`);

    const deleted = await tool(editor, 'delete_page', { page: aId });
    expect(deleted.text).toBe('Moved 2 page(s) to the trash.');
    const gone = await tool(editor, 'read_page', { page: bId });
    expect(gone).toEqual({ text: 'Page not found.', isError: true });
  });
});
