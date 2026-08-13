import { expect, test } from './fixtures';
import {
  cancelReservationByApi,
  deleteRoomByApi,
  loginByApi,
} from './helpers';

test('audit filters are reflected in URL query and render server results', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('audit-room');
  const reservation = await e2eData.createTestReservation(room.id, 'audit-reservation');

  try {
    await page.goto('/admin/audit');
    await page.getByTestId('audit-reservation-id-input').fill(reservation.id);
    await expect(page).toHaveURL(new RegExp(`reservationId=${reservation.id}`));
    await page.getByTestId('audit-room-select').selectOption(room.id);
    await expect(page).toHaveURL(new RegExp(`roomId=${room.id}`));
    await page.getByTestId('audit-action-select').selectOption('CREATED_BY_ADMIN');
    await expect(page).toHaveURL(/action=CREATED_BY_ADMIN/);
    await page.getByTestId('audit-search-button').click();

    await expect(page).toHaveURL(new RegExp(`reservationId=${reservation.id}`));
    await expect(page).toHaveURL(new RegExp(`roomId=${room.id}`));
    await expect(page).toHaveURL(/action=CREATED_BY_ADMIN/);
    await expect(page).toHaveURL(/page=0/);

    const table = page.getByTestId('audit-table');
    await expect(table).toContainText('testing-audit-seed');
    await expect(table.locator(`a[href="/admin/reservations/${reservation.id}"]`)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('audit-reservation-id-input')).toHaveValue(reservation.id);
    await expect(page.getByTestId('audit-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('audit-action-select')).toHaveValue('CREATED_BY_ADMIN');
    await expect(table).toContainText('testing-audit-seed');
  } finally {
    await cancelReservationByApi(request, reservation.id, 'testing-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('audit rows keep a stable target summary and column geometry', async ({ page, request }) => {
  await loginByApi(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  const longPurpose = 'testing-deleted-snapshot-purpose-that-should-not-be-rendered';
  const longActorId = 'testing-audit-actor-id-without-breakpoints-0123456789';
  const longMemo = 'testing 감사 이력의 긴 메모는 자신의 열 안에서 자연스럽게 여러 줄로 표시됩니다.';

  await page.route('**/api/admin/audit/reservation-histories**', async (route) => {
    const requestedPage = Number(new URL(route.request().url()).searchParams.get('page') || 0);
    const liveItem = {
      id: '00000000-0000-0000-0000-000000000000',
      reservationId: '10000000-0000-0000-0000-000000000000',
      action: 'UPDATED',
      beforeStatus: 'REQUESTED',
      afterStatus: 'CONFIRMED',
      memo: requestedPage === 0 ? longMemo : 'testing-short-memo',
      reservationRoomId: '20000000-0000-0000-0000-000000000000',
      reservationPurpose: 'testing-live-purpose',
      reservationRoomName: 'testing-live-room',
      reservationStartAt: '2026-06-03T10:00:00+09:00',
      reservationEndAt: '2026-06-03T11:00:00+09:00',
      actorType: 'ADMIN',
      actorId: requestedPage === 0 ? longActorId : 'admin',
      createdAt: '2026-05-28T08:59:00+09:00',
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: requestedPage === 0 ? [
          liveItem,
          {
            id: '00000000-0000-0000-0000-000000000001',
            reservationId: '10000000-0000-0000-0000-000000000001',
            action: 'DELETED',
            beforeStatus: 'CONFIRMED',
            afterStatus: null,
            memo: null,
            reservationRoomId: '20000000-0000-0000-0000-000000000001',
            reservationPurpose: longPurpose,
            reservationRoomName: 'testing-deleted-room',
            reservationStartAt: '2026-06-01T10:00:00+09:00',
            reservationEndAt: '2026-06-01T11:00:00+09:00',
            actorType: 'ADMIN',
            actorId: 'admin',
            createdAt: '2026-05-28T09:00:00+09:00',
          },
          {
            id: '00000000-0000-0000-0000-000000000002',
            reservationId: '10000000-0000-0000-0000-000000000002',
            action: 'DELETED',
            beforeStatus: 'REQUESTED',
            afterStatus: null,
            memo: null,
            reservationRoomId: null,
            reservationPurpose: '   ',
            reservationRoomName: 'testing-partial-room',
            reservationStartAt: null,
            reservationEndAt: null,
            actorType: 'ADMIN',
            actorId: 'admin',
            createdAt: '2026-05-28T09:01:00+09:00',
          },
          {
            id: '00000000-0000-0000-0000-000000000003',
            reservationId: '10000000-0000-0000-0000-000000000003',
            action: 'DELETED',
            beforeStatus: null,
            afterStatus: null,
            memo: null,
            reservationRoomId: null,
            reservationPurpose: null,
            reservationRoomName: '   ',
            reservationStartAt: '2026-06-02T12:00:00+09:00',
            reservationEndAt: '2026-06-02T13:00:00+09:00',
            actorType: 'ADMIN',
            actorId: 'admin',
            createdAt: '2026-05-28T09:02:00+09:00',
          },
          {
            id: '00000000-0000-0000-0000-000000000004',
            reservationId: '10000000-0000-0000-0000-000000000004',
            action: 'DELETED',
            beforeStatus: null,
            afterStatus: null,
            memo: null,
            reservationRoomId: null,
            reservationPurpose: null,
            reservationRoomName: null,
            reservationStartAt: null,
            reservationEndAt: null,
            actorType: 'ADMIN',
            actorId: 'admin',
            createdAt: '2026-05-28T09:03:00+09:00',
          },
        ] : [liveItem],
        page: requestedPage,
        size: 20,
        totalItems: 6,
        totalPages: 2,
      }),
    });
  });

  await page.goto('/admin/audit?action=DELETED');

  const table = page.getByTestId('audit-table');
  await expect(table.getByRole('columnheader')).toHaveText([
    '처리 시각',
    '처리 유형',
    '대상 예약',
    '상태 변경',
    '처리자',
    '메모',
  ]);
  const headerGeometry = await table.getByRole('columnheader').evaluateAll((headers) =>
    headers.map((header) => {
      const box = header.getBoundingClientRect();
      return { x: box.x, width: box.width };
    }),
  );
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(5);
  const liveSummaryLink = rows.nth(0).locator('.audit-reservation-link');
  await expect(liveSummaryLink).toHaveAttribute('href', '/admin/reservations/10000000-0000-0000-0000-000000000000');
  await expect(liveSummaryLink.locator('.audit-snapshot-room')).toHaveText('testing-live-room');
  await expect(liveSummaryLink.locator('.audit-snapshot-time')).toContainText('2026. 6. 3.');
  await expect(rows.nth(1).locator('.audit-snapshot-room')).toHaveText('testing-deleted-room');
  await expect(rows.nth(1).locator('.audit-snapshot-time')).toContainText('2026. 6. 1.');
  await expect(rows.nth(1).locator('.audit-reservation-snapshot')).not.toContainText(longPurpose);
  await expect(rows.nth(2).locator('.audit-snapshot-room')).toHaveText('testing-partial-room');
  await expect(rows.nth(2).locator('.audit-snapshot-time')).toHaveText('-');
  await expect(rows.nth(3).locator('.audit-snapshot-room')).toHaveText('-');
  await expect(rows.nth(3).locator('.audit-snapshot-time')).toContainText('2026. 6. 2.');
  await expect(rows.nth(4).locator('.audit-snapshot-room')).toHaveText('-');
  await expect(rows.nth(4).locator('.audit-snapshot-time')).toHaveText('-');
  await expect(table.locator('.audit-reservation-link')).toHaveCount(1);
  await expect(table.getByText('상세 보기', { exact: true })).toHaveCount(0);

  expect(await rows.nth(0).locator('.audit-actor-cell .table-break-anywhere').evaluate((element) => ({
    overflowWrap: getComputedStyle(element).overflowWrap,
    fitsColumn: element.scrollWidth <= element.clientWidth,
  }))).toEqual({ overflowWrap: 'anywhere', fitsColumn: true });
  expect(await rows.nth(0).locator('.table-description-cell').evaluate((element) => ({
    wordBreak: getComputedStyle(element).wordBreak,
    fitsColumn: element.scrollWidth <= element.clientWidth,
  }))).toEqual({ wordBreak: 'keep-all', fitsColumn: true });

  await page.locator('.pagination-desktop-controls').getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/page=1/);
  const nextHeaderGeometry = await table.getByRole('columnheader').evaluateAll((headers) =>
    headers.map((header) => {
      const box = header.getBoundingClientRect();
      return { x: box.x, width: box.width };
    }),
  );
  expect(nextHeaderGeometry).toHaveLength(headerGeometry.length);
  nextHeaderGeometry.forEach((box, index) => {
    expect(Math.abs(box.x - headerGeometry[index].x)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.width - headerGeometry[index].width)).toBeLessThanOrEqual(1);
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/audit?action=DELETED&page=0');
  const tableWrap = table.locator('xpath=..');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await tableWrap.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});
