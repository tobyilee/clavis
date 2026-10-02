import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
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

  // Search by meaning: no Workers AI under wrangler dev --local, so it says it fell back.
  await page.getByLabel('뜻으로 찾기').check();
  await expect(page).toHaveURL(/mode=hybrid/);
  await expect(page.getByText('뜻으로 찾기를 지금 쓸 수 없어')).toBeVisible();
  await expect(page.getByRole('link', { name: /결제 API 설계/ })).toBeVisible();
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

  // History: the other save is listed with its diff, and the first text comes back (D-54, D-56).
  await page.goto(page.url().replace(/\/edit$/, '/history'));
  const revisions = page.getByRole('list', { name: '버전 목록' });
  await expect(revisions.getByRole('button')).toHaveCount(2);
  await expect(revisions.getByRole('button').first()).toContainText('현재');
  const changes = page.getByRole('region', { name: '바뀐 내용' });
  await expect(changes.locator('[data-kind="add"]', { hasText: '다른 사람의 문장' })).toBeVisible();
  // The current revision has nothing to restore.
  await expect(changes.getByRole('button', { name: '이 버전으로 복원' })).toHaveCount(0);
  await revisions.getByRole('button').last().click();
  await changes.getByRole('button', { name: '이 버전으로 복원' }).click();
  await expect(page.getByRole('dialog')).toContainText('r1 버전으로 복원할까요?');
  await page.getByRole('dialog').getByRole('button', { name: '이 버전으로 복원' }).click();
  await expect(page).not.toHaveURL(/\/history/);
  await expect(page.locator('.prose-clavis')).not.toContainText('다른 사람의 문장');
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
    .getByLabel('파일 첨부')
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

test('comments: section thread with badge, reply, resolve', async ({ page, request }) => {
  await ensureSpace(request, 'QA', '품질');
  const fm = '---\ntype: note\nstatus: draft\nowner: dev@example.com\n---\n';
  const res = await request.post('/api/v1/spaces/QA/pages', {
    data: { title: '댓글 문서', content: `${fm}## 범위\n\n본문\n\n## 일정\n\n미정\n` },
  });
  const p = (await res.json()).page;
  await page.goto(`/s/QA/p/${p.slug}-${p.shortId}`);

  await page.getByLabel('새 댓글').fill('일정은 **언제** 정하나요?');
  await page.getByLabel('섹션').selectOption({ label: '일정' });
  await page.getByRole('button', { name: '댓글 달기' }).click();
  const thread = page.locator('article[id^="comment-"]');
  await expect(thread.locator('strong')).toHaveText('언제');
  await expect(thread.getByRole('link', { name: '§ 일정' })).toBeVisible();
  // The heading shows the open thread count.
  await expect(page.getByRole('button', { name: '이 섹션의 열린 댓글 1개' })).toBeVisible();

  await thread.getByRole('button', { name: '답글' }).click();
  await thread.getByLabel('답글').fill('다음 주에 정합니다.');
  await thread.getByRole('button', { name: '답글' }).last().click();
  await expect(thread.getByText('다음 주에 정합니다.')).toBeVisible();

  await thread.getByRole('button', { name: '해결' }).click();
  await expect(page.getByRole('button', { name: '해결된 스레드 1개 보기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '이 섹션의 열린 댓글 1개' })).toHaveCount(0);

  // An agent answers the thread by appending to that section only (REST, D-48).
  const append = await request.put(
    `/api/v1/pages/${p.shortId}/sections/${encodeURIComponent('일정')}`,
    { data: { mode: 'append', content: '- 10월 첫 주에 확정\n' } },
  );
  expect(append.status()).toBe(200);
  const section = await (
    await request.get(`/api/v1/pages/${p.shortId}/sections/${encodeURIComponent('일정')}`)
  ).json();
  expect(section.content).toContain('미정\n\n- 10월 첫 주에 확정');
  await page.reload();
  await expect(page.locator('.prose-clavis').getByText('10월 첫 주에 확정')).toBeVisible();

  // An agent to talk to (Phase 3 Step 2): @mention it with autocomplete.
  const agent = await request.post('/api/v1/admin/agents', {
    data: { name: 'Adam', role: 'editor' },
  });
  const token = (
    await (await request.post(`/api/v1/admin/agents/${(await agent.json()).id}/tokens`)).json()
  ).token;
  const box = page.getByLabel('새 댓글');
  await box.fill('확인 부탁해요 @Ad');
  await page.getByRole('option', { name: 'Adam' }).click();
  await expect(box).toHaveValue(/^확인 부탁해요 @\[Adam\]\(actor:\w+\) $/);
  await page.getByRole('button', { name: '댓글 달기' }).click();
  await expect(page.locator('a[href^="#mention-"]', { hasText: '@Adam' })).toBeVisible();

  // The agent edits my page: the bell counts it and leads to the change.
  const bearer = { Authorization: `Bearer ${token}` };
  const current = await (
    await request.get(`/api/v1/pages/${p.shortId}`, { headers: bearer })
  ).json();
  await request.put(`/api/v1/pages/${p.shortId}`, {
    headers: bearer,
    data: { content: `${current.content}\n에이전트가 정리함\n`, baseRevision: current.revision },
  });
  const bell = page.getByRole('button', { name: /^알림/ });
  // The queue consumer runs a few seconds later.
  await expect(async () => {
    await page.reload();
    await expect(bell).toHaveAccessibleName('알림 (안 읽음 1개)', { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await bell.click();
  await page.getByRole('menuitem', { name: /댓글 문서/ }).click();
  await expect(page).toHaveURL(/\/history\?r=\d+&base=\d+$/);
  await expect(page.locator('[data-kind="add"]', { hasText: '에이전트가 정리함' })).toBeVisible();
  await expect(bell).toHaveAccessibleName('알림 (안 읽음 0개)');
});

test('space settings: stricter rule and a custom template', async ({ page, request }) => {
  await ensureSpace(request, 'SET', '설정');
  await page.goto('/s/SET/settings');
  await page.getByLabel('본문 H1').selectOption('error');
  await expect(page.getByRole('note')).toContainText('저장을 막습니다');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('저장했습니다');

  await page.getByRole('link', { name: '템플릿' }).click();
  await page.getByRole('button', { name: '새 템플릿' }).click();
  await page.getByLabel('이름').fill('주간 회의');
  await page.getByLabel('기본 템플릿에서 시작…').selectOption({ label: '회의록' });
  await expect(page.getByLabel('내용 (Markdown)')).toHaveValue(/owner: \{\{owner\}\}/);
  await page.getByRole('button', { name: '템플릿 저장' }).click();
  await expect(page.getByText('주간 회의')).toBeVisible();

  await page.goto('/s/SET/new');
  await page.getByLabel('제목').fill('9월 넷째 주');
  await page.getByText('주간 회의').click();
  await page.getByRole('button', { name: '만들고 편집하기' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.locator('.cm-content')).toContainText('## 액션 아이템');
  await expect(page.locator('.cm-content')).not.toContainText('{{owner}}');

  // The space's rule applies in the editor: an H1 is now an error and blocks saving.
  await typeAtEnd(page, '\n# 제목\n');
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeDisabled();

  // A channel for the space (Phase 3 Step 3): a local receiver gets a signed test message.
  const received: { headers: IncomingHttpHeaders; body: string }[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await page.goto('/s/SET/settings?tab=channels');
    await page.getByLabel('종류').selectOption('json');
    await page.getByLabel('URL').fill(`http://127.0.0.1:${port}/hook`);
    await page.getByRole('button', { name: '추가', exact: true }).click();
    const channel = page.getByRole('region', { name: /127\.0\.0\.1/ });
    await expect(channel.getByText(/서명 키/)).toBeVisible();
    await channel.getByRole('button', { name: '테스트 전송' }).click();
    await expect(channel.getByRole('status')).toHaveText('보냈습니다. 채널에서 확인해 보세요.');
    // Only the ping: the local queue consumer runs a few seconds late, so this test's earlier
    // page.created can reach the channel added just now, before or after the ping.
    const pings = received.filter((r) => r.headers['x-clavis-event'] === 'ping');
    expect(pings).toHaveLength(1);
    expect(pings[0]?.headers['x-clavis-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(JSON.parse(pings[0]?.body ?? '')).toMatchObject({
      event: 'ping',
      space: { key: 'SET' },
    });
    await expect(channel.getByRole('list', { name: '최근 전달' })).toContainText('테스트');
  } finally {
    server.close();
  }
});

test('home: favorites, recently viewed; raw Markdown and llms.txt; site title and my name', async ({
  page,
  request,
  baseURL,
}) => {
  await ensureSpace(request, 'HOME', '홈');
  const fm = '---\ntype: note\nstatus: draft\nowner: dev@example.com\n---\n';
  const res = await request.post('/api/v1/spaces/HOME/pages', {
    data: { title: '자주 보는 문서', content: `${fm}본문\n` },
  });
  const p = (await res.json()).page;
  const url = `/s/HOME/p/${encodeURI(`${p.slug}-${p.shortId}`)}`;

  await page.goto(url);
  // The release (README "버전"): the sidebar shows the one /api/v1/health reports.
  const { version } = await (await request.get('/api/v1/health')).json();
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  await expect(page.getByText(`Clavis v${version}`)).toBeVisible();
  await page.getByRole('button', { name: '즐겨찾기에 추가' }).click();
  await expect(page.getByRole('button', { name: '즐겨찾기에서 빼기' })).toBeVisible();
  const sidebarFavorites = page.getByRole('region', { name: '즐겨찾기' });
  await expect(sidebarFavorites.getByRole('link', { name: '자주 보는 문서' })).toBeVisible();

  // Copy for AI: title, link and the raw Markdown in one paste.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '더 보기' }).click();
  await page.getByRole('menuitem', { name: 'AI용 복사 (Markdown)' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(`# 자주 보는 문서\n\nSource: ${baseURL}${decodeURI(url)}\n\n${fm}본문\n`);

  await page.goto('/');
  const favorites = page.locator('section', {
    has: page.getByRole('heading', { name: '즐겨찾기' }),
  });
  await expect(favorites.getByRole('link', { name: /자주 보는 문서/ })).toBeVisible();
  const viewed = page.locator('section', {
    has: page.getByRole('heading', { name: '최근 본 문서' }),
  });
  await expect(viewed.getByRole('link', { name: /자주 보는 문서/ })).toBeVisible();

  // These paths reach the Worker (run_worker_first), not the single-page app.
  const md = await request.get(`${url}.md`);
  expect(md.headers()['content-type']).toBe('text/markdown; charset=utf-8');
  expect(await md.text()).toBe(`${fm}본문\n`);
  const llms = await (await request.get('/s/HOME/llms.txt')).text();
  expect(llms).toContain(`- [자주 보는 문서](${baseURL}${url}.md): note, draft`);
  expect(await (await request.get('/llms.txt')).text()).toContain('- [홈 (HOME)]');

  // An admin names the site: "Clavis - {title}" in the header and the browser tab (D-64).
  await page.goto('/admin');
  await page.getByRole('tab', { name: '일반' }).click();
  await page.getByLabel('사이트 제목').fill('결제팀 위키');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('저장했습니다.')).toBeVisible();
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Clavis - 결제팀 위키' })).toBeVisible();
  await expect(page).toHaveTitle('Clavis - 결제팀 위키');

  // People choose their display name; past records show it too (D-66, D-67).
  await page.goto(url);
  await header.getByRole('button', { name: '내 계정' }).click();
  await page.getByRole('menuitem', { name: '표시 이름 바꾸기' }).click();
  const rename = page.getByRole('dialog', { name: '표시 이름 바꾸기' });
  await rename.getByLabel('표시 이름').fill('이투비');
  await rename.getByRole('button', { name: '저장' }).click();
  await expect(rename).toBeHidden();
  await expect(header.getByRole('button', { name: '내 계정' })).toHaveText('이투비');
  await expect(page.getByRole('main').getByText('이투비', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveTitle('Clavis - 결제팀 위키');
  await expect(header.getByRole('button', { name: '내 계정' })).toHaveText('이투비');
});

test('editor: focused on open, light like GitHub even on a dark OS', async ({ page, request }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await ensureSpace(request, 'QA', '품질');
  const fm = '---\ntype: note\nstatus: draft\nowner: dev@example.com\n---\n';
  const res = await request.post('/api/v1/spaces/QA/pages', {
    data: { title: '커서 확인', content: `${fm}첫 줄\n` },
  });
  const p = (await res.json()).page;
  await page.goto(`/s/QA/p/${encodeURI(`${p.slug}-${p.shortId}`)}/edit`);

  // Ready to type at the start of the body, without a click.
  await expect(page.locator('.cm-content')).toBeFocused();
  await expect(page.locator('.cm-activeLine')).toHaveText('첫 줄');
  const colors = await page.evaluate(() => {
    const cursor = document.querySelector('.cm-cursor');
    return {
      cursor: cursor ? getComputedStyle(cursor).borderLeftColor : null,
      text: getComputedStyle(document.body).color,
      background: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(colors.cursor).toBe(colors.text);
  // GitHub light: #1f2328 on white, whatever the OS prefers.
  expect(colors).toMatchObject({ text: 'rgb(31, 35, 40)', background: 'rgb(255, 255, 255)' });
});

test('sidebar: drag its edge wider, kept on reload; full title on a cut-short one', async ({
  page,
  request,
}) => {
  // A space of its own per attempt: a retry reuses the database, where the titles are taken.
  const key = `NAV${test.info().retry || ''}`;
  await ensureSpace(request, key, '탐색');
  const fm = '---\ntype: note\nstatus: draft\nowner: dev@example.com\n---\n';
  const long = 'BrewLoop SDK 적용 가이드와 실제 연동 결과';
  const res = await request.post(`/api/v1/spaces/${key}/pages`, {
    data: { title: long, content: `${fm}본문\n` },
  });
  await request.post(`/api/v1/spaces/${key}/pages`, { data: { title: '짧음', content: fm } });
  const p = (await res.json()).page;
  await page.goto(`/s/${key}/p/${encodeURI(`${p.slug}-${p.shortId}`)}`);

  // Cut short at the default width: hovering shows the whole title; a short one gets none.
  const tree = page.getByRole('navigation');
  // The name ends with the status ("초안"); the + link beside it starts with a quote.
  const longLink = tree.getByRole('link', { name: new RegExp(`^${long}`) });
  await longLink.hover();
  await expect(longLink).toHaveAttribute('title', long);
  const shortLink = tree.getByRole('link', { name: /^짧음/ });
  await shortLink.hover();
  await expect(shortLink).not.toHaveAttribute('title');

  const edge = page.getByRole('separator', { name: 'Resize sidebar' });
  const aside = page.locator('aside', { has: edge }); // not the table of contents
  expect((await aside.boundingBox())?.width).toBe(256);
  // Widen by what the ellipsis hides (fonts differ by OS) plus some room.
  const hidden = await longLink
    .locator('.truncate')
    .evaluate((el) => el.scrollWidth - el.clientWidth);
  const wide = 256 + hidden + 24;
  expect(wide).toBeLessThanOrEqual(560);
  const box = await edge.boundingBox();
  if (!box) throw new Error('no sidebar edge');
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + wide - 256, box.y + 200, { steps: 5 });
  await page.mouse.up();
  expect((await aside.boundingBox())?.width).toBe(wide);

  // Wide enough now, so no tooltip; the width survives a reload.
  await longLink.hover();
  await expect(longLink).not.toHaveAttribute('title');
  await page.reload();
  await expect(edge).toHaveAttribute('aria-valuenow', String(wide));

  // The keyboard moves it too; a double click puts it back.
  await edge.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(edge).toHaveAttribute('aria-valuenow', String(wide - 16));
  await edge.dblclick();
  expect((await aside.boundingBox())?.width).toBe(256);
});
