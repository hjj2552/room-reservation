import { expect, type Page, test } from '@playwright/test';
import { adminCredentials, loginByApi, loginByUi } from './helpers';

const protectedLocation = '/admin/reservations?page=3&status=REQUESTED&keyword=testing#results';

async function mockReservationPage(page: Page) {
  await page.route('**/api/admin/reservations?**', async (route) => {
    await route.fulfill({
      json: {
        items: [],
        page: 3,
        size: 20,
        totalItems: 61,
        totalPages: 4,
      },
    });
  });
}

async function expectProtectedLocation(page: Page) {
  await expect.poll(() => new URL(page.url()).pathname).toBe('/admin/reservations');
  const restored = new URL(page.url());
  expect(restored.searchParams.get('page')).toBe('3');
  expect(restored.searchParams.get('status')).toBe('REQUESTED');
  expect(restored.searchParams.get('keyword')).toBe('testing');
  expect(restored.hash).toBe('#results');
}

test('로그인 화면은 빈 자격 증명으로 시작한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/login');

  await expect(page.getByLabel('아이디')).toHaveValue('');
  await expect(page.getByLabel('비밀번호')).toHaveValue('');
  await expect(page.getByLabel('아이디')).toHaveAttribute('autocomplete', 'username');
  await expect(page.getByLabel('비밀번호')).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByLabel('아이디')).toHaveCSS('font-size', '16px');
  await expect(page.getByLabel('비밀번호')).toHaveCSS('font-size', '16px');
});

test('잘못된 자격 증명은 로그인 실패로만 안내한다', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('아이디').fill('testing-invalid-admin');
  await page.getByLabel('비밀번호').fill('testing-invalid-password');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page.getByRole('alert')).toHaveText('아이디 또는 비밀번호가 잘못되었습니다.');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page).not.toHaveURL(/\/admin\/reservations/);
});

test('비로그인 상태에서 보호 라우트 접근 시 로그인 화면으로 이동한다', async ({ page }) => {
  await page.goto('/admin/rooms');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: '공간 예약 운영 로그인' })).toBeVisible();
  await expect(page.getByText('아이디 또는 비밀번호가 잘못되었습니다.')).toHaveCount(0);
});

test('로그인 실패 후 성공해도 보호 라우트의 query와 hash를 복원한다', async ({ page }) => {
  await mockReservationPage(page);
  await page.goto(protectedLocation);
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.getByLabel('아이디').fill('testing-invalid-admin');
  await page.getByLabel('비밀번호').fill('testing-invalid-password');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.getByLabel('아이디').fill(adminCredentials.username);
  await page.getByLabel('비밀번호').fill(adminCredentials.password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expectProtectedLocation(page);
});

test('보호 라우트에서 전달된 위치는 이미 로그인된 세션에도 복원된다', async ({ page }) => {
  await mockReservationPage(page);
  await page.goto(protectedLocation);
  await expect(page).toHaveURL(/\/admin\/login$/);

  await loginByApi(page.request);
  await page.reload();
  await expectProtectedLocation(page);
});

test('직접 관리자 로그인 후 기본 예약 목록에 진입할 수 있다', async ({ page }) => {
  await loginByUi(page);
  await expect(page.getByRole('link', { name: '예약 목록' })).toBeVisible();
});

test('관리자 로그아웃 후 로그인 화면으로 이동한다', async ({ page }) => {
  await loginByUi(page);
  await page.goto('/admin/timetable?view=date&date=2026-09-15');
  await expect(page.getByTestId('timetable-date-input')).toHaveValue('2026-09-15');
  const contextKeys = [
    'admin-timetable-context',
    'admin-reservations-context',
    'admin-recurrences-context',
    'admin-rooms-context',
    'admin-audit-context',
  ];
  await page.evaluate((keys) => {
    for (const key of keys) window.sessionStorage.setItem(key, 'page=1');
  }, contextKeys);
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(await page.evaluate((keys) => keys.filter((key) => window.sessionStorage.getItem(key) !== null), contextKeys))
    .toEqual([]);

  await loginByUi(page);
  await page.getByRole('link', { name: '시간표', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/admin/timetable' && url.search === '');
});
