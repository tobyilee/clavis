import { expect, test } from '@playwright/test';
import { createPage, createSpace, ensureSpace, typeAtEnd } from './helpers';

test('write a spec: template, preview, lint, save, search', async ({ page }) => {
  await createSpace(page, 'PAY', '결제');
  await createPage(page, 'PAY', '결제 API 설계', '기술 명세 (Spec)');

  // The template fills the required sections, so the page starts lint-clean.
  await expect(page.locator('.cm-content')).toContainText('## 미결 사항');

  // An H1 in the body is a warning: shown, but the save still goes through.
  await typeAtEnd(page, '\n# 잘못된 제목\n\n비동기 승인 처리를 설명한다.\n');
  await expect(page.getByText('본문에 H1(#)을 쓰지 마세요')).toBeVisible();
  await expect(
    page.locator('.prose-clavis').getByText('비동기 승인 처리를 설명한다.'),
  ).toBeVisible();

  await page.getByLabel('유형').selectOption('spec');
  await page.getByLabel('상태').selectOption('review');
  await expect(page.locator('.cm-content')).toContainText('status: review');

  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page).not.toHaveURL(/\/edit$/);
  await expect(page.getByRole('heading', { level: 1, name: '결제 API 설계' })).toBeVisible();
  await expect(page.getByText('검토 중')).toBeVisible();

  // The sidebar tree and full-text search both find it.
  await expect(
    page.getByRole('navigation').getByRole('link', { name: '결제 API 설계' }).first(),
  ).toBeVisible();
  await page.goto(`/search?q=${encodeURIComponent('비동기')}`);
  await expect(page.getByRole('link', { name: /결제 API 설계/ })).toBeVisible();
  await expect(page.locator('mark')).toHaveText('비동기');
});

test('an error blocks the save; a conflict keeps my text', async ({ page, request }) => {
  await ensureSpace(request, 'PAY', '결제');
  await createPage(page, 'PAY', '충돌 테스트', '노트');

  // Break the frontmatter: saving is disabled and the problem is listed.
  await page.getByLabel('상태').selectOption('draft');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await expect(page.getByText(/frontmatter "type"/)).toBeVisible();
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeDisabled();
  await page.keyboard.press('Backspace');
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeEnabled();

  // Someone else saves meanwhile.
  const shortId = /-([0-9a-z]{6})\/edit$/.exec(page.url())?.[1];
  const current = await (await request.get(`/api/v1/pages/${shortId}`)).json();
  const other = await request.put(`/api/v1/pages/${shortId}`, {
    data: { content: `${current.content}\n다른 사람의 문장\n`, baseRevision: current.revision },
  });
  expect(other.status()).toBe(200);

  await typeAtEnd(page, '\n내 문장\n');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByRole('dialog')).toContainText('다른 사람이 먼저 저장했습니다');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '내 내용 복사하고 최신본 불러오기' }).click();
  await expect(page.locator('.cm-content')).toContainText('다른 사람의 문장');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('내 문장');
});

test('paste an image: uploaded, referenced, rendered', async ({ page, request }) => {
  await ensureSpace(request, 'PAY', '결제');
  await createPage(page, 'PAY', '그림 첨부', '노트');
  // A 1x1 PNG, as if pasted from the clipboard.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: '구조도.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.cm-content')).toContainText('](attachments/구조도.png)');
  await expect(page.locator('.prose-clavis img')).toHaveJSProperty('naturalWidth', 1);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page).not.toHaveURL(/\/edit$/);
  await expect(page.locator('.prose-clavis img')).toHaveJSProperty('naturalWidth', 1);
});

test('dashboard: findings and broken links, backlinks, jump to the line', async ({
  page,
  request,
}) => {
  await ensureSpace(request, 'QA', '품질');
  const fm = '---\ntype: note\nstatus: draft\nowner: dev@example.com\n---\n';
  const make = async (title: string, body: string) => {
    const res = await request.post('/api/v1/spaces/QA/pages', {
      data: { title, content: `${fm}${body}` },
    });
    expect(res.status()).toBe(201);
    return (await res.json()).page;
  };
  const target = await make('기준 문서', '본문\n');
  await make('링크 문서', '# 큰 제목\n\n[[기준 문서]] 와 [[없는 문서]]\n');

  // The home page was created before any summary; the dashboard rechecks it by itself.
  await page.goto('/s/QA/health');
  await expect(page.getByRole('heading', { name: '문서 상태' })).toBeVisible();
  await expect(page.getByText('[[없는 문서]]')).toBeVisible();
  const finding = page.getByRole('link', { name: /본문 H1/ });
  await expect(finding).toContainText('L6');
  await expect(page.getByRole('status')).toHaveCount(0);

  await finding.click();
  await expect(page).toHaveURL(/\/edit\?line=6$/);
  await expect(page.locator('.cm-activeLine')).toContainText('# 큰 제목');

  await page.goto(`/s/QA/p/${target.slug}-${target.shortId}`);
  await expect(page.getByText('이 페이지를 링크하는 문서 1개')).toBeVisible();
  await expect(page.getByRole('link', { name: '링크 문서' }).last()).toBeVisible();
});
