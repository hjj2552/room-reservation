import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loginByUi } from './helpers';

const toggle = (page: Page) => page.getByRole('button', { name: '관리자 메뉴 열기' });
const drawer = (page: Page) => page.getByRole('dialog', { name: '관리자 메뉴', exact: true });

async function expectClosed(page: Page, restored = true) {
  await expect(drawer(page)).toHaveCount(0);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('main')).not.toHaveAttribute('inert');
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
  if (restored) await expect(toggle(page)).toBeFocused();
}

test('desktop sidebar and mobile drawer preserve navigation, pending count and focus', async ({ page }, testInfo) => {
  let countRequests = 0;
  await page.route('**/api/admin/reservations?**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('size') !== '1') return route.continue();
    countRequests += 1;
    return route.fulfill({ json: { items: [], page: 0, size: 1, totalItems: 3, totalPages: 3 } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/reservations');
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.getByText('관리자 메뉴', { exact: true })).toHaveCount(1);
  await expect(toggle(page)).toBeHidden();
  await expect(page.getByRole('link', { name: '승인 대기 예약 3건 보기' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '예약 목록', exact: true })).toBeVisible();
  await expect(page.getByTestId('reservation-keyword-filter')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('admin-desktop.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await expectClosed(page, false);
  await expect(page.getByRole('link', { name: '예약 목록', exact: true })).toHaveCount(0);
  await expect(toggle(page)).toHaveAccessibleDescription('승인 대기 예약 3건');
  await expect(toggle(page).locator('.admin-menu-pending-dot')).toBeVisible();
  const titleBox = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  const toggleBox = (await toggle(page).boundingBox())!;
  expect(toggleBox.x + toggleBox.width).toBeLessThan(titleBox.x);
  expect(Math.abs(toggleBox.y + toggleBox.height / 2 - titleBox.y - titleBox.height / 2)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('admin-mobile-closed.png') });
  const requestsBeforeOpen = countRequests;
  await toggle(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.admin-menu-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer(page)).toHaveAttribute('id', 'admin-mobile-menu');
  await expect(page.locator('main')).toHaveAttribute('inert');
  await expect(page.locator('body')).toHaveCSS('position', 'fixed');
  const close = page.getByRole('button', { name: '관리자 메뉴 닫기' });
  const logout = page.getByRole('button', { name: '로그아웃' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(logout).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.locator('.admin-menu-toggle').evaluate((element: HTMLButtonElement) => element.focus());
  await expect(close).toBeFocused();
  const scrollTop = await page.locator('body').evaluate(element => element.style.top);
  await page.mouse.move(380, 700);
  await page.mouse.wheel(0, 600);
  expect(await page.locator('body').evaluate(element => element.style.top)).toBe(scrollTop);
  await expect(drawer(page).locator('.session-name')).not.toBeEmpty();
  await expect(drawer(page).getByRole('link', { name: '예약 목록', exact: true })).toHaveAttribute('aria-current', 'page');
  const links = drawer(page).locator('.nav-list a:not(.pending-reservation-link)');
  await expect(links).toHaveText(['예약 목록', '시간표', '반복 예약', '공간 관리', '운영 설정', '태그 설정', '감사 이력']);
  const linkBoxes = await links.evaluateAll(elements => elements.map(element => {
    const { x, y } = element.getBoundingClientRect();
    return { x, y };
  }));
  expect(linkBoxes.every((box, index) => box.x === linkBoxes[0].x
    && (index === 0 || box.y > linkBoxes[index - 1].y))).toBe(true);
  expect(countRequests).toBe(requestsBeforeOpen);
  await page.screenshot({ path: testInfo.outputPath('admin-mobile-open.png') });
  await page.keyboard.press('Escape');
  await expectClosed(page);

  await toggle(page).click();
  await close.click();
  await expectClosed(page);
  await toggle(page).click();
  await page.getByTestId('admin-menu-backdrop').click({ position: { x: 380, y: 250 } });
  await expectClosed(page);

  await toggle(page).click();
  await drawer(page).getByRole('link', { name: '운영 설정', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
  await expect(page.getByTestId('settings-form')).toBeVisible();
  await expectClosed(page, false);
  await expect(toggle(page)).not.toBeFocused();
  await toggle(page).click();
  await drawer(page).getByRole('link', { name: '승인 대기 예약 3건 보기' }).click();
  await expect(page).toHaveURL(/status=REQUESTED&page=0/);
  await expectClosed(page, false);

  await toggle(page).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
  await expect(page.locator('main')).not.toHaveAttribute('inert');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectClosed(page, false);
  await toggle(page).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/settings$/);
  await expectClosed(page, false);
});

test('mobile titles and actions fit across admin pages with a shared menu', async ({ page, e2eData }, testInfo) => {
  const room = await e2eData.createTestRoom('mobile-menu');
  const reservation = await e2eData.createTestReservation(room.id, 'mobile-menu');
  const recurrenceRoom = await e2eData.createTestRoom('mobile-menu-recurrence');
  const recurrence = await e2eData.createTestRecurringReservation(recurrenceRoom.id, 'mobile-menu');
  const paths = [
    'reservations', 'timetable', 'recurrences', 'rooms', 'settings', 'settings/tags', 'audit',
    `reservations/${reservation.id}`, `reservations/${reservation.id}/edit`,
    `recurrences/${recurrence.recurrenceId}`,
  ];
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [index, path] of paths.entries()) {
      await page.goto(`/admin/${path}`);
      await expect(page.locator('.state-box').filter({ hasText: '불러오는' })).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(toggle(page)).toBeVisible();
      await expectClosed(page, false);
      const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
      const button = (await toggle(page).boundingBox())!;
      expect(button.x + button.width).toBeLessThan(title.x);
      expect(title.x + title.width).toBeLessThanOrEqual(width);
      for (const action of await page.locator('.page-header .header-actions > *').all()) {
        const box = (await action.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.x >= title.x + title.width || box.y >= title.y + title.height).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`admin-${width}-${index}.png`) });
      await toggle(page).click();
      await expect(drawer(page)).toBeVisible();
      await drawer(page).getByRole('link', { name: '예약 목록', exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/reservations/);
      await expectClosed(page, false);
    }
  }
});

test('mobile menu remains available on settings load failure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/admin/settings', route => route.fulfill({ status: 503, json: { message: 'testing-settings-error' } }));
  await page.goto('/admin/settings');
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await toggle(page).click();
  await drawer(page).getByRole('link', { name: '예약 목록', exact: true }).click();
  await expectClosed(page, false);
});

test('closing the menu restores the current title button after loading completes', async ({ page }) => {
  let finishLoading!: () => void;
  const loading = new Promise<void>(resolve => { finishLoading = resolve; });
  await page.route('**/api/admin/settings', async route => {
    await loading;
    await route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/settings');
  await toggle(page).click();
  await expect(drawer(page)).toBeVisible();
  finishLoading();
  await expect(page.getByTestId('settings-form')).toBeAttached();
  await page.keyboard.press('Escape');
  await expectClosed(page);
});

test('mobile drawer logout returns to the unchanged login screen', async ({ page, context }) => {
  // Use an independent login so logging out does not invalidate the shared setup session.
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await loginByUi(page);
  await toggle(page).click();
  await drawer(page).getByRole('button', { name: '로그아웃' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
  await expect(drawer(page)).toHaveCount(0);
  await expect(toggle(page)).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
});
