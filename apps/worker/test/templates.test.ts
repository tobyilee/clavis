import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

let editor: { bearer: string };
let viewer: { bearer: string };

const setConfig = (config: unknown, who: object = ADMIN) =>
  call('/api/v1/spaces/PAY/lint-config', { ...who, method: 'PUT', body: config });

beforeEach(async () => {
  await resetDb();
  editor = await agentWithRole('editor');
  viewer = await agentWithRole('viewer');
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'ARCH', name: 'A' } });
});

describe('space lint config (D-47)', () => {
  it('is admin-only, validated, versioned and shown on the space', async () => {
    expect((await setConfig({ rules: { 'clavis/no-h1': 'error' } }, editor)).status).toBe(403);
    const bad = await setConfig({ rules: { 'clavis/frontmatter-required': 'off' } });
    expect(bad.status).toBe(400);
    const ok = await setConfig({ rules: { 'clavis/no-h1': 'error' }, docLengthKb: 20 });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({
      lintConfig: { rules: { 'clavis/no-h1': 'error' }, requiredSections: {}, docLengthKb: 20 },
      lintConfigVersion: 1,
    });
    const space = await call('/api/v1/spaces/PAY', viewer);
    expect(space.json.lintConfigVersion).toBe(1);
    const other = await call('/api/v1/spaces/ARCH', viewer);
    expect(other.json).toMatchObject({ lintConfig: { rules: {} }, lintConfigVersion: 0 });
  });

  it('applies to saves and to /lint, in that space only', async () => {
    await setConfig({ rules: { 'clavis/no-h1': 'error' } });
    const body = { title: 'x', content: `${FM()}# 제목\n` };
    const blocked = await call('/api/v1/spaces/PAY/pages', { ...editor, method: 'POST', body });
    expect(blocked.status).toBe(422);
    expect(blocked.json.violations[0]).toMatchObject({ ruleId: 'clavis/no-h1', severity: 'error' });
    const elsewhere = await call('/api/v1/spaces/ARCH/pages', { ...editor, method: 'POST', body });
    expect(elsewhere.status).toBe(201);

    const lint = await call('/api/v1/lint', {
      ...viewer,
      method: 'POST',
      body: { content: body.content, space: 'PAY' },
    });
    expect(lint.json.violations[0].severity).toBe('error');
    // Linting against a page uses that page's space.
    const byPage = await call('/api/v1/lint', {
      ...viewer,
      method: 'POST',
      body: { content: body.content, page: elsewhere.json.page.id },
    });
    expect(byPage.json.violations[0].severity).toBe('warning');
  });

  it('marks page summaries stale so the dashboard rechecks', async () => {
    await call('/api/v1/spaces/PAY/lint/recheck', { ...viewer, method: 'POST' });
    expect((await call('/api/v1/spaces/PAY/health', viewer)).json.stalePages).toBe(0);
    await setConfig({ rules: { 'clavis/code-lang': 'off' } });
    expect((await call('/api/v1/spaces/PAY/health', viewer)).json.stalePages).toBe(1);
  });
});

describe('templates (D-49)', () => {
  const custom = `---\ntype: meeting\nstatus: draft\nowner: {{owner}}\ntags: [weekly]\n---\n## 참석자\n\n## 논의 내용\n\n{{date}} {{title}}\n\n## 결정 사항\n\n## 액션 아이템\n`;

  it('lists built-in templates with the space required sections', async () => {
    await setConfig({
      requiredSections: { adr: [{ ko: '배경' }, { ko: '결정', en: 'Decision' }] },
    });
    const res = await call('/api/v1/templates?space=PAY&locale=en', viewer);
    const adr = res.json.templates.find((t: { id: string }) => t.id === 'adr');
    expect(adr).toMatchObject({ scope: 'builtin', requiredSections: ['배경', 'Decision'] });
    expect(adr.content).toContain('## 배경\n\n## Decision\n');
    const created = await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: '결정 1', template: 'adr' },
    });
    expect(created.json.violations).toEqual([]);
  });

  it('creates pages from a custom template, filling placeholders', async () => {
    const made = await call('/api/v1/templates', {
      ...editor,
      method: 'POST',
      body: { space: 'PAY', name: '주간 회의', description: '팀 주간 회의', content: custom },
    });
    expect(made.status).toBe(201);
    const list = (await call('/api/v1/templates?space=PAY', viewer)).json.templates;
    expect(list[0]).toMatchObject({
      id: made.json.id,
      scope: 'space',
      spaceKey: 'PAY',
      type: 'meeting',
      name: '주간 회의',
      requiredSections: ['참석자', '논의 내용', '결정 사항', '액션 아이템'],
    });
    // Other spaces neither list nor accept it.
    const arch = (await call('/api/v1/templates?space=ARCH', viewer)).json.templates;
    expect(arch.map((t: { id: string }) => t.id)).not.toContain(made.json.id);
    const wrongSpace = await call('/api/v1/spaces/ARCH/pages', {
      ...editor,
      method: 'POST',
      body: { title: 'x', template: made.json.id },
    });
    expect(wrongSpace.status).toBe(400);

    const page = await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: '주간 회의 9/28', template: made.json.id },
    });
    expect(page.status).toBe(201);
    expect(page.json.page).toMatchObject({
      docType: 'meeting',
      owner: 'bot-editor',
      tags: ['weekly'],
    });
    const content = (await call(`/api/v1/pages/${page.json.page.id}`, viewer)).json.content;
    expect(content).toMatch(/\n\d{4}-\d{2}-\d{2} 주간 회의 9\/28\n/);
  });

  it('checks templates with the space rules and limits every-space ones to admins', async () => {
    const noFm = await call('/api/v1/templates', {
      ...editor,
      method: 'POST',
      body: { space: 'PAY', name: 'x', content: '## 본문\n' },
    });
    expect(noFm.status).toBe(422);
    expect(noFm.json.violations[0].ruleId).toBe('clavis/frontmatter-required');

    const global = { space: null, name: '공통 노트', content: `${FM()}본문\n` };
    expect(
      (await call('/api/v1/templates', { ...editor, method: 'POST', body: global })).status,
    ).toBe(403);
    const made = await call('/api/v1/templates', { ...ADMIN, method: 'POST', body: global });
    expect(made.status).toBe(201);
    const inArch = (await call('/api/v1/templates?space=ARCH', viewer)).json.templates;
    expect(inArch[0]).toMatchObject({ id: made.json.id, scope: 'global', spaceKey: null });

    const put = { name: '공통', description: '', content: `${FM()}수정\n` };
    expect(
      (await call(`/api/v1/templates/${made.json.id}`, { ...editor, method: 'PUT', body: put }))
        .status,
    ).toBe(403);
    expect(
      (await call(`/api/v1/templates/${made.json.id}`, { ...ADMIN, method: 'PUT', body: put }))
        .status,
    ).toBe(204);
    expect(
      (await call(`/api/v1/templates/${made.json.id}`, { ...ADMIN, method: 'DELETE' })).status,
    ).toBe(204);
    expect(
      (await call(`/api/v1/templates/${made.json.id}`, { ...ADMIN, method: 'DELETE' })).status,
    ).toBe(404);
    expect(
      (await call('/api/v1/templates', { ...viewer, method: 'POST', body: global })).status,
    ).toBe(403);
  });
});
