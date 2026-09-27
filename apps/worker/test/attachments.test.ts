import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanFilename, uniqueFilename } from '../src/services/attachments';
import { ADMIN, agentWithRole, call, FM, resetDb } from './helpers';

let editor: { bearer: string };
let viewer: { bearer: string };
let pageId: string;

const upload = (name: string, bytes: string, type = 'image/png', auth = editor) =>
  call(`/api/v1/pages/${pageId}/attachments?filename=${encodeURIComponent(name)}`, {
    ...auth,
    method: 'POST',
    raw: bytes,
    headers: {
      'content-type': type,
      'content-length': String(new TextEncoder().encode(bytes).length),
    },
  });

beforeEach(async () => {
  await resetDb();
  editor = await agentWithRole('editor');
  viewer = await agentWithRole('viewer');
  await call('/api/v1/spaces', { ...ADMIN, method: 'POST', body: { key: 'PAY', name: '결제' } });
  const created = await call('/api/v1/spaces/PAY/pages', {
    ...editor,
    method: 'POST',
    body: { title: '설계', content: FM() },
  });
  pageId = created.json.page.id;
});

describe('attachments', () => {
  it('uploads, lists, serves and deletes a file', async () => {
    const up = await upload('아키텍처 그림.png', 'PNGDATA');
    expect(up.status).toBe(201);
    expect(up.json).toMatchObject({
      filename: '아키텍처-그림.png',
      mimeType: 'image/png',
      sizeBytes: 7,
    });

    const listed = await call(`/api/v1/pages/${pageId}/attachments`, viewer);
    expect(listed.json.attachments.map((a: { filename: string }) => a.filename)).toEqual([
      '아키텍처-그림.png',
    ]);

    const file = await call(up.json.url, viewer);
    expect(file.status).toBe(200);
    expect(file.text).toBe('PNGDATA');
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(file.headers.get('content-security-policy')).toContain('sandbox');
    expect(file.headers.get('content-disposition')).toMatch(/^inline;/);

    const cached = await call(up.json.url, {
      ...viewer,
      headers: { 'if-none-match': file.headers.get('etag') ?? '' },
    });
    expect(cached.status).toBe(304);

    expect(
      (await call(`/api/v1/attachments/${up.json.id}`, { ...viewer, method: 'DELETE' })).status,
    ).toBe(403);
    expect(
      (await call(`/api/v1/attachments/${up.json.id}`, { ...editor, method: 'DELETE' })).status,
    ).toBe(204);
    expect((await call(up.json.url, viewer)).status).toBe(404);
    expect(await env.FILES.list({ prefix: 'att/' }).then((l) => l.objects.length)).toBe(0);
  });

  it('renames on collision and lets saves reference the file', async () => {
    await upload('a.png', 'x');
    const second = await upload('a.png', 'y');
    expect(second.json.filename).toBe('a-1.png');

    const save = await call(`/api/v1/pages/${pageId}`, {
      ...editor,
      method: 'PUT',
      body: { content: `${FM()}![그림](attachments/a-1.png)\n`, baseRevision: 1 },
    });
    expect(save.status).toBe(200);
    const missing = await call(`/api/v1/pages/${pageId}`, {
      ...editor,
      method: 'PUT',
      body: { content: `${FM()}![그림](attachments/b.png)\n`, baseRevision: 2 },
    });
    expect(missing.status).toBe(422);
    expect(missing.json.violations[0].ruleId).toBe('clavis/attachment-exists');
  });

  it('downloads active content instead of rendering it', async () => {
    const up = await upload('x.svg', '<svg onload="alert(1)"/>', 'image/svg+xml');
    const file = await call(up.json.url, viewer);
    expect(file.headers.get('content-disposition')).toMatch(/^attachment;/);
  });

  it('rejects oversize and length-less uploads, and viewers', async () => {
    const big = await call(`/api/v1/pages/${pageId}/attachments?filename=big.bin`, {
      ...editor,
      method: 'POST',
      raw: 'x',
      headers: {
        'content-length': String(26 * 1024 * 1024),
        'content-type': 'application/octet-stream',
      },
    });
    expect(big.status).toBe(413);
    expect((await upload('v.png', 'x', 'image/png', viewer)).status).toBe(403);
  });

  it('hides files of trashed pages', async () => {
    const up = await upload('a.png', 'x');
    const other = await call('/api/v1/spaces/PAY/pages', {
      ...editor,
      method: 'POST',
      body: { title: '다른', content: FM() },
    });
    expect(other.status).toBe(201);
    await call(`/api/v1/pages/${pageId}`, { ...editor, method: 'DELETE' });
    expect((await call(up.json.url, viewer)).status).toBe(404);
  });

  it('cleans file names', () => {
    expect(cleanFilename('../../etc/passwd')).toBe('passwd');
    expect(cleanFilename('회의 사진 (1).JPG')).toBe('회의-사진-1.JPG');
    expect(cleanFilename('...')).toBe('file');
    expect(uniqueFilename('a.png', new Set(['a.png', 'a-1.png']))).toBe('a-2.png');
    expect(uniqueFilename('README', new Set(['README']))).toBe('README-1');
  });
});
