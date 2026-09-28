import { expect, test } from '@playwright/test';
import { createPage, createSpace, typeAtEnd } from './helpers';

test('read and edit on a phone', async ({ page }) => {
  await createSpace(page, 'MOB', '모바일');
  await createPage(page, 'MOB', '현장 메모', '노트');
  await typeAtEnd(page, '\n## 메모\n\n회의실 예약 완료\n');

  // iOS Safari zooms in on a field under 16px and stays zoomed, pushing Save off screen.
  await page.getByRole('button', { name: '속성 보기' }).click();
  const smallFields = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        'input:not([type=file], [type=checkbox], [type=radio]), select, textarea, [contenteditable=true]',
      ),
    ]
      .filter((el) => el.offsetParent && Number.parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(smallFields).toEqual([]);
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeInViewport({
    ratio: 1,
  });

  // [편집 | 미리보기] tabs instead of a split view (D-06).
  await page.getByRole('tab', { name: '미리보기' }).click();
  await expect(page.locator('.prose-clavis').getByText('회의실 예약 완료')).toBeVisible();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page).not.toHaveURL(/\/edit$/);

  // The drawer holds the tree; no horizontal scrolling anywhere.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('dialog').getByRole('link', { name: '모바일' }).first().click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
