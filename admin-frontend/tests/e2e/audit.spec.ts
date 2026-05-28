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
    await page.goto('/audit');
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
    await expect(table).toContainText('e2e-audit-seed');
    await expect(table.locator(`a[href="/reservations/${reservation.id}"]`)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('audit-reservation-id-input')).toHaveValue(reservation.id);
    await expect(page.getByTestId('audit-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('audit-action-select')).toHaveValue('CREATED_BY_ADMIN');
    await expect(table).toContainText('e2e-audit-seed');
  } finally {
    await cancelReservationByApi(request, reservation.id, 'e2e-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('deleted audit rows render two-line snapshots without detail links', async ({ page, request }) => {
  await loginByApi(request);
  const longPurpose = 'e2e-deleted-snapshot-purpose-that-should-not-be-rendered';

  await page.route('**/api/admin/audit/reservation-histories**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            reservationId: '10000000-0000-0000-0000-000000000001',
            action: 'DELETED',
            beforeStatus: 'CONFIRMED',
            afterStatus: null,
            memo: null,
            reservationRoomId: '20000000-0000-0000-0000-000000000001',
            reservationPurpose: longPurpose,
            reservationRoomName: 'e2e-deleted-room',
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
            reservationRoomName: 'e2e-partial-room',
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
        ],
        page: 0,
        size: 20,
        totalItems: 4,
        totalPages: 1,
      }),
    });
  });

  await page.goto('/audit?action=DELETED');

  const rows = page.getByTestId('audit-table').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0).locator('.audit-snapshot-room')).toHaveText('e2e-deleted-room');
  await expect(rows.nth(0).locator('.audit-snapshot-time')).toContainText('2026. 6. 1.');
  await expect(rows.nth(0).locator('.audit-reservation-snapshot')).not.toContainText(longPurpose);
  await expect(rows.nth(1).locator('.audit-snapshot-room')).toHaveText('e2e-partial-room');
  await expect(rows.nth(1).locator('.audit-snapshot-time')).toHaveText('-');
  await expect(rows.nth(2).locator('.audit-snapshot-room')).toHaveText('-');
  await expect(rows.nth(2).locator('.audit-snapshot-time')).toContainText('2026. 6. 2.');
  await expect(rows.nth(3).locator('.audit-snapshot-room')).toHaveText('-');
  await expect(rows.nth(3).locator('.audit-snapshot-time')).toHaveText('-');
  await expect(page.getByTestId('audit-table').locator('a', { hasText: '상세 보기' })).toHaveCount(0);
});
