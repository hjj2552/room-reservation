import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loginByApi } from './helpers';

const pagedListPaths = [
  '/api/admin/reservations',
  '/api/admin/recurrences',
  '/api/admin/rooms',
  '/api/admin/audit/reservation-histories',
];

async function mockPagedLists(page: Page) {
  for (const pathname of pagedListPaths) {
    await page.route(`**${pathname}**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== pathname || route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        json: {
          items: [],
          page: Number(url.searchParams.get('page') || '0'),
          size: 20,
          totalItems: 41,
          totalPages: 3,
        },
      });
    });
  }
}

async function visitSettings(page: Page) {
  await page.getByRole('link', { name: '운영 설정', exact: true }).click();
  await expect(page.getByRole('heading', { name: '운영 설정', exact: true })).toBeVisible();
}

test('administrator list menus restore only applied URL context', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('navigation-context');
  await mockPagedLists(page);

  await page.goto(
    `/admin/reservations?status=CONFIRMED&roomId=${room.id}`
      + '&fromDate=2026-09-01&toDate=2026-09-30&keyword=testing-applied&page=1&unknown=ignored',
  );
  await expect(page.getByTestId('reservation-keyword-filter')).toHaveValue('testing-applied');
  await page.getByTestId('reservation-keyword-filter').fill('testing-unapplied');
  await visitSettings(page);
  await page.getByRole('link', { name: '예약 목록', exact: true }).click();
  await expect(page.getByTestId('reservation-keyword-filter')).toHaveValue('testing-applied');
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({
    status: 'CONFIRMED',
    roomId: room.id,
    fromDate: '2026-09-01',
    toDate: '2026-09-30',
    keyword: 'testing-applied',
    page: '1',
  });

  await page.goto(
    `/admin/recurrences?roomId=${room.id}&fromDate=2026-10-01`
      + '&toDate=2026-10-31&keyword=testing-recurring&page=1',
  );
  await expect(page.getByTestId('recurrence-list-keyword-filter')).toHaveValue('testing-recurring');
  await visitSettings(page);
  await page.getByRole('link', { name: '반복 예약', exact: true }).click();
  await expect(page).toHaveURL((url) => (
    url.pathname === '/admin/recurrences'
    && url.searchParams.get('roomId') === room.id
    && url.searchParams.get('fromDate') === '2026-10-01'
    && url.searchParams.get('toDate') === '2026-10-31'
    && url.searchParams.get('keyword') === 'testing-recurring'
    && url.searchParams.get('page') === '1'
  ));

  await page.goto('/admin/rooms?keyword=testing-room&page=1');
  await expect(page.getByTestId('room-keyword-input')).toHaveValue('testing-room');
  const roomListRegion = page.getByRole('region', { name: '공간 목록' });
  await expect(roomListRegion).toBeVisible();
  await expect(roomListRegion.getByRole('heading', { name: '공간 목록' })).toHaveClass(/sr-only/);
  await visitSettings(page);
  await page.getByRole('link', { name: '공간 관리', exact: true }).click();
  await expect(page).toHaveURL(/keyword=testing-room/);
  await expect(page).toHaveURL(/page=1/);
  await page.getByTestId('room-search-reset').click();
  await expect(page).toHaveURL((url) => (
    url.pathname === '/admin/rooms'
    && !url.searchParams.has('keyword')
    && url.searchParams.get('page') === '0'
  ));
  await visitSettings(page);
  await page.getByRole('link', { name: '공간 관리', exact: true }).click();
  await expect(page.getByTestId('room-keyword-input')).toHaveValue('');
  await expect(page).toHaveURL((url) => url.searchParams.get('page') === '0');

  await page.goto(
    `/admin/audit?reservationId=testing-reservation-id&roomId=${room.id}`
      + '&action=UPDATED&fromDate=2026-11-01&toDate=2026-11-30&keyword=testing-audit-applied&page=1',
  );
  await expect(page.getByTestId('audit-reservation-id-input')).toHaveValue('testing-reservation-id');
  await expect(page.getByTestId('audit-keyword-input')).toHaveValue('testing-audit-applied');
  await page.getByTestId('audit-keyword-input').fill('testing-audit-unapplied');
  await visitSettings(page);
  await page.getByRole('link', { name: '감사 이력', exact: true }).click();
  await expect(page.getByTestId('audit-keyword-input')).toHaveValue('testing-audit-applied');
  await expect(page).toHaveURL((url) => (
    url.pathname === '/admin/audit'
    && url.searchParams.get('reservationId') === 'testing-reservation-id'
    && url.searchParams.get('roomId') === room.id
    && url.searchParams.get('action') === 'UPDATED'
    && url.searchParams.get('fromDate') === '2026-11-01'
    && url.searchParams.get('toDate') === '2026-11-30'
    && url.searchParams.get('keyword') === 'testing-audit-applied'
    && url.searchParams.get('page') === '1'
  ));

  await page.goto('/admin/rooms?keyword=testing-corrected&page=invalid');
  await expect(page).toHaveURL((url) => url.searchParams.get('page') === '0');
  await visitSettings(page);
  await page.getByRole('link', { name: '공간 관리', exact: true }).click();
  await expect(page).toHaveURL((url) => (
    url.searchParams.get('keyword') === 'testing-corrected'
    && url.searchParams.get('page') === '0'
  ));
});

test('administrator list navigation falls back to bare URLs when session storage is blocked', async ({ page, request }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value: () => { throw new DOMException('Storage is blocked'); },
      });
    }
  });
  await loginByApi(request);
  await mockPagedLists(page);

  await page.goto('/admin/reservations?keyword=testing-explicit&page=1');
  await expect(page.getByTestId('reservation-keyword-filter')).toHaveValue('testing-explicit');
  await visitSettings(page);
  await page.getByRole('link', { name: '예약 목록', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/admin/reservations' && url.search === '');
});
