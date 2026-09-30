import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, call, resetDb } from './helpers';

const TEAMMATE = { as: 'teammate@gmail.com' };
const STRANGER = { as: 'stranger@gmail.com' };

beforeEach(async () => {
  await resetDb();
  await call('/api/v1/me', ADMIN);
  await call('/api/v1/me', TEAMMATE);
  const people = (await call('/api/v1/admin/actors', ADMIN)).json.actors as {
    id: string;
    email: string;
  }[];
  const teammate = people.find((p) => p.email === 'teammate@gmail.com');
  await call(`/api/v1/admin/actors/${teammate?.id}`, {
    ...ADMIN,
    method: 'PATCH',
    body: { role: 'editor' },
  });
});

const setTitle = (who: object, title: string) =>
  call('/api/v1/admin/site', { ...who, method: 'PUT', body: { title } });

describe('site title (D-64, D-65)', () => {
  it('is empty until an admin sets it, and clears again', async () => {
    expect((await call('/api/v1/site', TEAMMATE)).json).toEqual({ title: null });

    const saved = await setTitle(ADMIN, '  결제팀 위키 ');
    expect(saved.status).toBe(200);
    expect(saved.json).toEqual({ title: '결제팀 위키' });
    expect((await call('/api/v1/site', TEAMMATE)).json).toEqual({ title: '결제팀 위키' });

    expect((await setTitle(ADMIN, '   ')).json).toEqual({ title: null });
    expect((await call('/api/v1/site', TEAMMATE)).json).toEqual({ title: null });
  });

  it('is readable while approval is pending, but only admins set it', async () => {
    await setTitle(ADMIN, 'Payments');
    const pending = await call('/api/v1/site', STRANGER);
    expect(pending.status).toBe(200);
    expect(pending.json.title).toBe('Payments');

    const editor = await setTitle(TEAMMATE, 'Mine');
    expect(editor.status).toBe(403);
    expect((await call('/api/v1/site', ADMIN)).json.title).toBe('Payments');
  });

  it('refuses long titles and line breaks', async () => {
    expect((await setTitle(ADMIN, 'x'.repeat(40))).status).toBe(200);
    expect((await setTitle(ADMIN, 'x'.repeat(41))).status).toBe(400);
    expect((await setTitle(ADMIN, 'two\nlines')).status).toBe(400);
  });
});
