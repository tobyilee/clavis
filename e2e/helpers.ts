import { type APIRequestContext, expect, type Page } from '@playwright/test';

/** Types into CodeMirror at the end of the document. */
export async function typeAtEnd(page: Page, text: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(text);
}

/** Creates a space through the UI (the first person to sign in is the admin). */
export async function createSpace(page: Page, key: string, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: '새 Space' }).click();
  await page.getByLabel('키').fill(key);
  await page.getByLabel('이름').fill(name);
  await page.getByRole('button', { name: '만들기' }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${key}/p/`));
}

/** Creates a page from a template and lands in its editor. */
export async function createPage(page: Page, key: string, title: string, template: string) {
  await page.goto(`/s/${key}/new`);
  await page.getByLabel('제목').fill(title);
  await page.getByText(template, { exact: true }).click();
  await page.getByRole('button', { name: '만들고 편집하기' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.locator('.cm-content')).toBeVisible();
}

/** Makes sure a space exists, through the API (409 = already there). */
export async function ensureSpace(request: APIRequestContext, key: string, name: string) {
  const res = await request.post('/api/v1/spaces', { data: { key, name } });
  expect([201, 409]).toContain(res.status());
}
