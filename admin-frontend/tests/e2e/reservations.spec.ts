import { expect, test } from '@playwright/test';
import {
  cancelReservationByApi,
  createReservationByApi,
  createRoomByApi,
  deleteRoomByApi,
  loginByApi,
  nextWeekdayAtLocalInput,
  nextWeekdayReservationLocalInputs,
  uniqueE2eName,
} from './helpers';

test('reservation list filters are reflected in URL query and survive reload', async ({ page }) => {
  await page.goto('/reservations');

  await page.getByTestId('reservation-status-filter').selectOption('CONFIRMED');
  await expect(page).toHaveURL(/status=CONFIRMED/);
  await page.getByTestId('reservation-keyword-filter').fill('E2E');
  await expect(page).toHaveURL(/keyword=E2E/);
  await page.getByTestId('reservation-from-date-filter').fill('2026-05-01');
  await page.getByTestId('reservation-search-button').click();

  await expect(page).toHaveURL(/status=CONFIRMED/);
  await expect(page).toHaveURL(/keyword=E2E/);
  await expect(page).toHaveURL(/fromDate=2026-05-01/);
  await expect(page).toHaveURL(/page=0/);

  await page.reload();

  await expect(page.getByTestId('reservation-status-filter')).toHaveValue('CONFIRMED');
  await expect(page.getByTestId('reservation-keyword-filter')).toHaveValue('E2E');
  await expect(page.getByTestId('reservation-from-date-filter')).toHaveValue('2026-05-01');
});

test('reservation edit: saved changes are visible on detail and list', async ({ page, request }) => {
  await loginByApi(request);
  const room = await createRoomByApi(request, uniqueE2eName('Reservation Edit Room'));
  const reservation = await createReservationByApi(request, room.id, uniqueE2eName('reservation edit seed'));
  const updatedPurpose = uniqueE2eName('reservation edit updated');

  try {
    await page.goto(`/reservations/${reservation.id}`);
    await page.getByTestId('reservation-edit-link').click();

    await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}/edit$`));
    await page.getByTestId('reservation-room-select').selectOption({ label: room.name });
    await expect(page.getByTestId('reservation-room-select')).toHaveValue(room.id);
    await page.getByTestId('reservation-purpose-input').fill(updatedPurpose);
    await page.getByTestId('reservation-memo-input').fill('E2E reservation edit smoke');
    await page.getByTestId('reservation-save-button').click();

    await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}$`));
    await expect(page.getByTestId('reservation-purpose')).toHaveText(updatedPurpose);

    await page.goto(`/reservations?keyword=${encodeURIComponent(updatedPurpose)}`);
    await expect(page.getByTestId('reservations-table')).toContainText(updatedPurpose);
    await expect(page.getByTestId('reservations-table')).toContainText(room.name);
  } finally {
    await cancelReservationByApi(request, reservation.id, 'E2E cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('admin can create a reservation and see it on detail and list pages', async ({ page, request }) => {
  await loginByApi(request);
  const room = await createRoomByApi(request, uniqueE2eName('Reservation Create Room'));
  const purpose = uniqueE2eName('reservation create');
  const reservationTime = nextWeekdayReservationLocalInputs();
  let createdReservationId: string | undefined;

  try {
    await page.goto('/reservations/new');
    await page.getByTestId('reservation-room-select').selectOption(room.id);
    await page.getByTestId('reservation-applicant-name-input').fill('E2E Admin');
    await page.getByTestId('reservation-email-input').fill(`reservation-${Date.now()}@example.com`);
    await page.getByTestId('reservation-phone-input').fill('010-1111-2222');
    await page.getByTestId('reservation-purpose-input').fill(purpose);
    await page.getByTestId('reservation-start-input').fill(reservationTime.startAt);
    await page.getByTestId('reservation-end-input').fill(reservationTime.endAt);
    await page.getByTestId('reservation-memo-input').fill('E2E create verification');

    await expect(page.getByTestId('reservation-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('reservation-purpose-input')).toHaveValue(purpose);
    await expect(page.getByTestId('reservation-start-input')).toHaveValue(reservationTime.startAt);
    await expect(page.getByTestId('reservation-end-input')).toHaveValue(reservationTime.endAt);

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/reservations') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('reservation-save-button').click();
    const createResponse = await createResponsePromise;
    const createResponseBody = await createResponse.text();
    expect(createResponse.ok(), createResponseBody).toBeTruthy();

    const created = JSON.parse(createResponseBody) as { id: string };
    createdReservationId = created.id;

    await expect(page).toHaveURL(new RegExp(`/reservations/${createdReservationId}$`));
    await expect(page.getByTestId('reservation-purpose')).toHaveText(purpose);
    await expect(page.getByRole('heading', { name: room.name })).toBeVisible();

    await page.goto(`/reservations?keyword=${encodeURIComponent(purpose)}`);
    await expect(page.getByTestId('reservations-table')).toContainText(purpose);
    await expect(page.getByTestId('reservations-table')).toContainText(room.name);
  } finally {
    if (createdReservationId) {
      await cancelReservationByApi(request, createdReservationId, 'E2E cleanup');
    }
    await deleteRoomByApi(request, room.id);
  }
});
