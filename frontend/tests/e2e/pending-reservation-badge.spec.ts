import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const emptyRooms = { items: [], page: 0, size: 100, totalItems: 0, totalPages: 0 };

async function mockReservationLists(
  page: Page,
  pendingCount: () => number,
  pendingFails: () => boolean = () => false,
) {
  const badgeRequests: URL[] = [];
  const listRequests: URL[] = [];

  await page.route('**/api/admin/rooms?**', (route) => route.fulfill({ json: emptyRooms }));
  await page.route('**/api/admin/reservations?**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('size') === '1') {
      badgeRequests.push(url);
      if (pendingFails()) {
        return route.fulfill({ status: 503, json: { message: 'testing-pending-count-failure' } });
      }
      const totalItems = pendingCount();
      return route.fulfill({
        json: {
          items: [],
          page: 0,
          size: 1,
          totalItems,
          totalPages: totalItems,
        },
      });
    }

    listRequests.push(url);
    const pageNumber = Number(url.searchParams.get('page') || '0');
    return route.fulfill({
      json: {
        items: [],
        page: pageNumber,
        size: 20,
        totalItems: 80,
        totalPages: 4,
      },
    });
  });

  return { badgeRequests, listRequests };
}

async function refetchPendingCount(page: Page, requests: URL[]) {
  const previousRequestCount = requests.length;
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => requests.length).toBeGreaterThan(previousRequestCount);
}

function pendingBadgeLink(page: Page) {
  return page.locator('.pending-reservation-link');
}

function pendingBadgeName(count: number) {
  return `승인 대기 예약 ${count.toLocaleString('ko-KR')}건 보기`;
}

test('pending reservation badge uses the count query and stable accessible boundaries', async ({ page }) => {
  let pendingCount = 0;
  const { badgeRequests } = await mockReservationLists(page, () => pendingCount);

  await page.goto('/admin/reservations');
  await expect.poll(() => badgeRequests.length).toBeGreaterThan(0);
  expect(badgeRequests[0].searchParams.get('status')).toBe('REQUESTED');
  expect(badgeRequests[0].searchParams.get('page')).toBe('0');
  expect(badgeRequests[0].searchParams.get('size')).toBe('1');
  await expect(pendingBadgeLink(page)).toHaveCount(0);

  const reservationLabel = page.getByRole('link', { name: '예약 목록', exact: true });
  const labelX = (await reservationLabel.boundingBox())!.x;
  for (const count of [1, 9, 10, 99, 100]) {
    pendingCount = count;
    await refetchPendingCount(page, badgeRequests);
    const link = page.getByRole('link', { name: pendingBadgeName(count) });
    await expect(link).toBeVisible();
    const badge = link.locator('.pending-reservation-badge');
    await expect(badge).toHaveText(count >= 100 ? '99+' : String(count));
    if (count === 1) {
      const box = (await badge.boundingBox())!;
      expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
      await expect(badge).toHaveCSS('background-color', 'rgb(138, 97, 0)');
      await expect(badge).toHaveCSS('color', 'rgb(255, 255, 255)');
    }
    if (count === 10) {
      const box = (await badge.boundingBox())!;
      expect(box.width).toBeGreaterThan(box.height);
    }
  }
  expect(Math.abs((await reservationLabel.boundingBox())!.x - labelX)).toBeLessThanOrEqual(1);
  await expect(page.locator('.nav-item-with-badge a')).toHaveCount(2);
  await expect(page.locator('.nav-item-with-badge a a')).toHaveCount(0);
  const desktopBadgeLinkBox = (await pendingBadgeLink(page).boundingBox())!;
  expect(desktopBadgeLinkBox.width).toBeGreaterThanOrEqual(44);
  expect(desktopBadgeLinkBox.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  const [labelBox, badgeLinkBox] = await Promise.all([
    reservationLabel.boundingBox(),
    pendingBadgeLink(page).boundingBox(),
  ]);
  expect(labelBox).not.toBeNull();
  expect(badgeLinkBox).not.toBeNull();
  expect(badgeLinkBox!.width).toBeGreaterThanOrEqual(44);
  expect(badgeLinkBox!.height).toBeGreaterThanOrEqual(44);
  expect(labelBox!.x + labelBox!.width).toBeLessThanOrEqual(badgeLinkBox!.x + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('pending badge and reservation label keep their separate navigation contracts', async ({ page }) => {
  const { listRequests } = await mockReservationLists(page, () => 7);
  const savedSearch = 'status=CONFIRMED&roomId=00000000-0000-4000-8000-000000000001'
    + '&fromDate=2026-08-01&toDate=2026-08-31&keyword=testing-saved&page=3';

  await page.goto(`/admin/reservations?${savedSearch}`);
  await expect(page.getByRole('heading', { name: '예약 목록' })).toBeVisible();
  await page.goto('/admin/settings');
  await page.getByRole('link', { name: '예약 목록', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/admin/reservations' && url.search === `?${savedSearch}`);

  await page.goto('/admin/settings');
  const requestedList = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/admin/reservations'
      && url.searchParams.get('status') === 'REQUESTED'
      && url.searchParams.get('page') === '0'
      && url.searchParams.get('size') === '20';
  });
  await page.getByRole('link', { name: pendingBadgeName(7) }).click();
  await expect(page).toHaveURL((url) => (
    url.pathname === '/admin/reservations' && url.search === '?status=REQUESTED&page=0'
  ));
  const listUrl = new URL((await requestedList).url());
  expect([...listUrl.searchParams.keys()]).toEqual(['status', 'page', 'size']);
  await expect(page.getByTestId('reservation-status-filter')).toHaveValue('REQUESTED');
  expect(listRequests.some((url) => (
    url.searchParams.get('status') === 'REQUESTED'
      && url.searchParams.get('page') === '0'
      && url.searchParams.get('size') === '20'
  ))).toBe(true);
});

test('pending count failure hides only the badge', async ({ page }) => {
  let pendingFailures = 0;
  await mockReservationLists(page, () => 0, () => {
    pendingFailures += 1;
    return true;
  });

  await page.goto('/admin/reservations');
  await expect(page.getByRole('heading', { name: '예약 목록' })).toBeVisible();
  await expect.poll(() => pendingFailures).toBeGreaterThanOrEqual(1);
  await expect(pendingBadgeLink(page)).toHaveCount(0);
  await expect(page.locator('.state-box.error')).toHaveCount(0);
});

test('approving and cancelling reservations refresh the pending count', async ({ page, e2eData }) => {
  const firstRoom = await e2eData.createTestRoom('pending-badge-approve');
  const secondRoom = await e2eData.createTestRoom('pending-badge-cancel');
  const firstReservation = await e2eData.createTestPublicReservation(firstRoom.id, 'pending-badge-approve');
  const secondReservation = await e2eData.createTestPublicReservation(secondRoom.id, 'pending-badge-cancel');

  await page.goto(`/admin/reservations/${firstReservation.id}`);
  const badge = pendingBadgeLink(page);
  await expect(badge).toBeVisible();
  const initialCount = Number((await badge.getAttribute('aria-label'))!.replace(/\D/g, ''));
  expect(initialCount).toBeGreaterThanOrEqual(2);

  await page.getByRole('button', { name: '승인', exact: true }).click();
  await expect(badge).toHaveAttribute('aria-label', pendingBadgeName(initialCount - 1));

  await page.goto(`/admin/reservations/${secondReservation.id}`);
  await page.getByRole('button', { name: '취소', exact: true }).click();
  const remainingCount = initialCount - 2;
  if (remainingCount > 0) {
    await expect(badge).toHaveAttribute('aria-label', pendingBadgeName(remainingCount));
  } else {
    await expect(badge).toHaveCount(0);
  }
});
