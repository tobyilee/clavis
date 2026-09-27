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
      'create_page',
      'delete_page',
      'get_backlinks',
      'get_space_health',
      'get_space_tree',
      'lint_markdown',
      'list_spaces',
      'list_templates',
      'move_page',
      'read_page',
      'search_pages',
      'update_page',
    ]);
  });

  it('hides write tools from viewer agents', async () => {
    const viewer = await agentWithRole('viewer');
    const tools = await rpc('tools/list', {}, viewer);
    const names = tools.json.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('search_pages');
    expect(names).not.toContain('create_page');
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
