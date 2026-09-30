import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

const STRANGER = { as: 'stranger@gmail.com' };
let adam: { bearer: string; id: string };

beforeEach(async () => {
  await resetDb();
  adam = await agentWithRole('editor', 'Adam');
});

const rename = (who: object, name: string) =>
  call('/api/v1/me', { ...who, method: 'PATCH', body: { name } });

describe('display names (D-66 ~ D-68)', () => {
  it('lets a person rename themselves; past records show the new name', async () => {
    await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
    const created = await call('/api/v1/spaces/PAY/pages', {
      ...ADMIN,
      method: 'POST',
      body: { title: '정책', content: `${FM()}본문\n` },
    });
    const pageId = created.json.page.id;
    await call(`/api/v1/pages/${pageId}/comments`, {
      ...ADMIN,
      method: 'POST',
      body: { body: '확인 부탁' },
    });

    const res = await rename(ADMIN, '  Toby   Lee ');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ name: 'Toby Lee', email: 'owner@gmail.com', role: 'admin' });
    expect((await call('/api/v1/me', ADMIN)).json.name).toBe('Toby Lee');

    const page = (await call(`/api/v1/pages/${pageId}`, ADMIN)).json;
    expect(page.createdBy.name).toBe('Toby Lee');
    const comments = (await call(`/api/v1/pages/${pageId}/comments`, ADMIN)).json;
    expect(comments.threads[0].author.name).toBe('Toby Lee');
    const history = (await call(`/api/v1/pages/${pageId}/revisions`, ADMIN)).json;
    expect(history.revisions[0].actor.name).toBe('Toby Lee');
  });

  it('keeps the new name on the next sign-in, and works while approval is pending', async () => {
    await call('/api/v1/me', ADMIN);
    expect((await rename(STRANGER, '새 사람')).json).toMatchObject({
      name: '새 사람',
      role: 'pending',
    });
    expect((await call('/api/v1/me', STRANGER)).json.name).toBe('새 사람');
  });

  it('refuses a name another person or agent has, ignoring case', async () => {
    await call('/api/v1/me', ADMIN);
    await rename(STRANGER, 'Kim');

    const agentName = await rename(ADMIN, 'ADAM');
    expect(agentName.status).toBe(409);
    expect(agentName.json.type).toMatch(/name-taken$/);
    expect((await rename(ADMIN, 'kim')).status).toBe(409);
    expect((await call('/api/v1/me', ADMIN)).json.name).toBe('owner');

    // One's own name, even in another case, is fine.
    expect((await rename(STRANGER, 'KIM')).json.name).toBe('KIM');
  });

  it('refuses names the @mention markup cannot hold', async () => {
    await call('/api/v1/me', ADMIN);
    expect((await rename(ADMIN, 'x'.repeat(64))).status).toBe(200);
    for (const name of ['x'.repeat(65), 'a]b', 'a[b', 'two\nlines', '   ']) {
      expect((await rename(ADMIN, name)).status, name).toBe(400);
    }
  });

  it('leaves agents to the admin, who cannot reuse a taken name either', async () => {
    const self = await rename({ bearer: adam.bearer }, 'Eve');
    expect(self.status).toBe(403);
    expect(self.json.type).toMatch(/agent-rename$/);

    const again = await call('/api/v1/admin/agents', {
      ...ADMIN,
      method: 'POST',
      body: { name: 'adam', role: 'viewer' },
    });
    expect(again.status).toBe(409);

    const toPerson = await call(`/api/v1/admin/actors/${adam.id}`, {
      ...ADMIN,
      method: 'PATCH',
      body: { name: 'Owner', role: 'viewer' },
    });
    expect(toPerson.status).toBe(409);
    // Nothing else in the refused change was applied.
    const agent = (await call('/api/v1/me', { bearer: adam.bearer })).json;
    expect(agent).toMatchObject({ name: 'Adam', role: 'editor' });
  });
});
