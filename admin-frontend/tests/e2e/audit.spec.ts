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
