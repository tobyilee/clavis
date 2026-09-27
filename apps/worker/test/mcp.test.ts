import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, resetDb } from './helpers';

const admin = { as: 'owner@gmail.com' };
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

async function agentToken() {
  await call('/api/v1/me', admin);
  const agent = await call('/api/v1/admin/agents', {
    ...admin,
    method: 'POST',
    body: { name: 'hermes' },
  });
  const issued = await call(`/api/v1/admin/agents/${agent.json.id}/tokens`, {
    ...admin,
    method: 'POST',
  });
  return issued.json.token as string;
}

async function seedWiki() {
  const t = Date.now();
  const owner = await env.DB.prepare(
    "SELECT id FROM actors WHERE email = 'owner@gmail.com'",
  ).first<{ id: string }>();
  const by = owner?.id ?? '';
  const page = (id: string, sid: string, parent: string | null, pos: string, title: string) =>
    env.DB.prepare(
      `INSERT INTO pages (id, short_id, space_id, parent_id, position, title, slug, content, doc_type, status,
         created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, 's1', ?, ?, ?, 'slug', ?, 'spec', 'approved', ?, ?, ?, ?)`,
    ).bind(
      id,
      sid,
      parent,
      pos,
      title,
      `---\ntype: spec\nstatus: approved\nowner: owner@gmail.com\n---\n## ${title}\n`,
      by,
      by,
      t,
      t,
    );
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO spaces (id, key, name, created_at) VALUES ('s1', 'PAY', '결제', ?)",
    ).bind(t),
    page('p1', 'aaa111', null, 'a0', '설계'),
    page('p2', 'bbb222', 'p1', 'a0', '결제 API'),
  ]);
}

beforeEach(resetDb);

describe('MCP endpoint', () => {
  it('initializes and lists the read tools for an agent', async () => {
    const token = await agentToken();
    const init = await rpc(
      'initialize',
      {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
      { bearer: token },
    );
    expect(init.status).toBe(200);
    expect(init.json.result.serverInfo.name).toBe('clavis');
    expect(init.json.result.instructions).toContain('list_spaces');

    const tools = await rpc('tools/list', {}, { bearer: token }, 2);
    expect(tools.json.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'get_space_tree',
      'list_spaces',
      'read_page',
    ]);
  });

  it('runs tools as the calling actor', async () => {
    const token = await agentToken();
    await seedWiki();

    const spaces = await rpc(
      'tools/call',
      { name: 'list_spaces', arguments: {} },
      { bearer: token },
    );
    const listed = JSON.parse(spaces.json.result.content[0].text);
    expect(listed).toEqual({
      actor: 'hermes',
      spaces: [{ key: 'PAY', name: '결제', description: null }],
    });

    const tree = await rpc(
      'tools/call',
      { name: 'get_space_tree', arguments: { space: 'pay' } },
      { bearer: token },
    );
    expect(JSON.parse(tree.json.result.content[0].text)).toEqual([
      {
        shortId: 'aaa111',
        title: '설계',
        docType: 'spec',
        status: 'approved',
        children: [
          {
            shortId: 'bbb222',
            title: '결제 API',
            docType: 'spec',
            status: 'approved',
            children: [],
          },
        ],
      },
    ]);

    const byTitle = await rpc(
      'tools/call',
      { name: 'read_page', arguments: { page: 'PAY:결제 API' } },
      { bearer: token },
    );
    expect(byTitle.json.result.content[0].text).toContain('revision=1');
    expect(byTitle.json.result.content[0].text).toContain('## 결제 API');

    const missing = await rpc(
      'tools/call',
      { name: 'read_page', arguments: { page: 'zzz999' } },
      { bearer: token },
    );
    expect(missing.json.result.isError).toBe(true);
  });

  it('rejects unauthenticated and pending callers before reaching MCP', async () => {
    expect((await rpc('tools/list', {}, {})).status).toBe(401);
    await call('/api/v1/me', admin);
    const pending = await rpc('tools/list', {}, { as: 'stranger@gmail.com' });
    expect(pending.status).toBe(403);
  });
});
