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

test('reservation list filters are reflected in URL query and survive reload', async ({ page, request }) => {
  await loginByApi(request);
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

test('reservation date view shows a timetable block and opens the detail page', async ({ page, request }) => {
  await loginByApi(request);
  const room = await createRoomByApi(request, uniqueE2eName('Date Timetable Room'));
  const purpose = uniqueE2eName('date timetable');
  const reservationDay = nextWeekdayReservationLocalInputs({ daysAhead: 21, startHour: 10, endHour: 11 }).date;
  const reservation = await createReservationByApi(request, room.id, purpose, {
    startAt: `${reservationDay}T10:00:00+09:00`,
    endAt: `${reservationDay}T11:00:00+09:00`,
    memo: 'E2E date timetable seed',
  });

  try {
    await page.goto('/timetable');
    await expect(page.getByRole('heading', { name: '시간표', exact: true })).toBeVisible();

    await page.getByTestId('timetable-date-input').fill(reservationDay);
    await page.getByTestId('timetable-date-room-select').selectOption(room.id);

    await expect(page).toHaveURL(new RegExp(`date=${reservationDay}`));
    await expect(page.getByTestId('reservation-date-timetable')).toBeVisible();
    await expect(page.getByTestId('reservation-date-timetable')).toContainText(room.name);
    await expect(page.getByTestId('reservation-date-timetable')).toContainText(purpose);

    await page.getByTestId('reservation-timetable-block').click();
    await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}$`));
  } finally {
    await cancelReservationByApi(request, reservation.id, 'E2E cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('reservation room view shows a weekly timetable block and opens the detail page', async ({ page, request }) => {
  await loginByApi(request);
  const room = await createRoomByApi(request, uniqueE2eName('Room Timetable Room'));
  const purpose = uniqueE2eName('room timetable');
  const reservationDay = nextWeekdayReservationLocalInputs({ daysAhead: 28, startHour: 15, endHour: 16 }).date;
  const weekStart = mondayOf(reservationDay);
  const reservation = await createReservationByApi(request, room.id, purpose, {
    startAt: `${reservationDay}T15:00:00+09:00`,
    endAt: `${reservationDay}T16:00:00+09:00`,
    memo: 'E2E room timetable seed',
  });

  try {
    await page.goto('/timetable');
    await page.getByTestId('timetable-view-room').click();
    await expect(page).toHaveURL(/view=room/);

    await page.getByTestId('timetable-room-select').selectOption(room.id);
    await page.getByTestId('timetable-week-input').fill(weekStart);

    await expect(page).toHaveURL(new RegExp(`roomViewRoomId=${room.id}`));
    await expect(page).toHaveURL(new RegExp(`weekStart=${weekStart}`));
    await expect(page.getByTestId('reservation-room-timetable')).toBeVisible();
    await expect(page.getByTestId('reservation-room-timetable')).toContainText(room.name);
    await expect(page.getByTestId('reservation-room-timetable')).toContainText(purpose);

    await page.getByTestId('reservation-room-timetable-block').click();
    await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}$`));
  } finally {
    await cancelReservationByApi(request, reservation.id, 'E2E cleanup');
    await deleteRoomByApi(request, room.id);
  }
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

function mondayOf(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

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
