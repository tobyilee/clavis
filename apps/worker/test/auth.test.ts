import { beforeEach, describe, expect, it } from 'vitest';
import { call, resetDb } from './helpers';

beforeEach(resetDb);

describe('human authentication (Cloudflare Access identity)', () => {
  it('rejects requests without an identity', async () => {
    const res = await call('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.type).toBe('application/problem+json');
  });

  it('makes the first person Admin and later people pending', async () => {
    expect((await call('/api/v1/me', { as: 'Owner@Gmail.com' })).json).toMatchObject({
      kind: 'human',
      email: 'owner@gmail.com',
      role: 'admin',
    });
    expect((await call('/api/v1/me', { as: 'stranger@gmail.com' })).json.role).toBe('pending');
    // Returning users keep their role.
    expect((await call('/api/v1/me', { as: 'owner@gmail.com' })).json.role).toBe('admin');
  });

  it('blocks pending people from everything except /me', async () => {
    await call('/api/v1/me', { as: 'owner@gmail.com' });
    const res = await call('/api/v1/admin/actors', { as: 'stranger@gmail.com' });
    expect(res.status).toBe(403);
    expect(res.json.type).toMatch(/approval-pending$/);
  });
});

describe('admin workflow', () => {
  const admin = { as: 'owner@gmail.com' };

  async function setup() {
    await call('/api/v1/me', admin);
    await call('/api/v1/me', { as: 'teammate@gmail.com' });
    const { json } = await call('/api/v1/admin/actors', admin);
    return json.actors as { id: string; email: string; role: string }[];
  }

  it('lists pending people first and approves them', async () => {
    const actors = await setup();
    expect(actors[0]).toMatchObject({ email: 'teammate@gmail.com', role: 'pending' });

    const approved = await call(`/api/v1/admin/actors/${actors[0]?.id}`, {
      ...admin,
      method: 'PATCH',
      body: { role: 'viewer' },
    });
    expect(approved.json.role).toBe('viewer');

    const forbidden = await call('/api/v1/admin/actors', { as: 'teammate@gmail.com' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.json.type).toMatch(/forbidden$/);
  });

  it('prevents admins from changing their own role', async () => {
    const actors = await setup();
    const self = actors.find((a) => a.email === 'owner@gmail.com');
    const res = await call(`/api/v1/admin/actors/${self?.id}`, {
      ...admin,
      method: 'PATCH',
      body: { role: 'viewer' },
    });
    expect(res.status).toBe(400);
  });

  it('returns problem+json for invalid request bodies', async () => {
    await setup();
    const res = await call('/api/v1/admin/agents', {
      ...admin,
      method: 'POST',
      body: { name: '' },
    });
    expect(res.status).toBe(400);
    expect(res.type).toBe('application/problem+json');
  });

  it('returns 404 problem+json for unknown routes once authenticated', async () => {
    await setup();
    const res = await call('/api/v1/nope', admin);
    expect(res.status).toBe(404);
    expect(res.type).toBe('application/problem+json');
  });
});

describe('agent tokens', () => {
  const admin = { as: 'owner@gmail.com' };

  async function agentWithToken() {
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
    return { agent: agent.json, issued: issued.json };
  }

  it('issues a token once and authenticates the agent with it', async () => {
    const { agent, issued } = await agentWithToken();
    expect(issued.token).toMatch(/^clv_[0-9A-Za-z]{43}$/);
    expect(issued.prefix).toBe(issued.token.slice(0, 8));

    const me = await call('/api/v1/me', { bearer: issued.token });
    expect(me.json).toMatchObject({ id: agent.id, kind: 'agent', name: 'hermes', role: 'editor' });

    const listed = await call('/api/v1/admin/tokens', admin);
    expect(listed.json.tokens[0]).not.toHaveProperty('token');
    expect(listed.json.tokens[0]).not.toHaveProperty('tokenHash');
    expect(listed.json.tokens[0].lastUsedAt).toBeTypeOf('number');
  });

  it('rejects unknown and revoked tokens', async () => {
    const { issued } = await agentWithToken();
    expect((await call('/api/v1/me', { bearer: 'clv_notarealtoken000000000000' })).status).toBe(
      401,
    );

    const revoke = await call(`/api/v1/admin/tokens/${issued.id}`, { ...admin, method: 'DELETE' });
    expect(revoke.status).toBe(204);
    expect((await call('/api/v1/me', { bearer: issued.token })).status).toBe(401);
  });

  it('prefers the Bearer token over the Access identity', async () => {
    const { issued } = await agentWithToken();
    const me = await call('/api/v1/me', { as: 'owner@gmail.com', bearer: issued.token });
    expect(me.json.kind).toBe('agent');
  });

  it('refuses to make an agent an admin', async () => {
    const { agent } = await agentWithToken();
    const res = await call(`/api/v1/admin/actors/${agent.id}`, {
      ...admin,
      method: 'PATCH',
      body: { role: 'admin' },
    });
    expect(res.status).toBe(400);
  });
});
