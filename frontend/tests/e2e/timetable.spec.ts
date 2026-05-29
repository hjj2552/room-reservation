import { expect, test } from './fixtures';
import {
  cancelReservationByApi,
  deleteRoomByApi,
  loginByApi,
  nextWeekdayReservationLocalInputs,
} from './helpers';

test('date view reads URL context and opens the reservation detail page', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('date-timetable-room');
  const reservationDay = nextWeekdayReservationLocalInputs({ daysAhead: 21, startHour: 10, endHour: 11 }).date;
  const reservation = await e2eData.createTestReservation(room.id, 'date-timetable', {
    startAt: `${reservationDay}T10:00:00+09:00`,
    endAt: `${reservationDay}T11:00:00+09:00`,
    memo: 'e2e-date-timetable-seed',
  });
  const purpose = reservation.purpose || '';

  try {
    await page.goto(`/admin/timetable?view=date&date=${reservationDay}&roomId=${room.id}`);
    await expect(page.getByRole('heading', { name: '시간표', exact: true })).toBeVisible();

    await expect(page.getByTestId('timetable-date-input')).toHaveValue(reservationDay);
    await expect(page.getByTestId('timetable-date-room-select')).toHaveValue(room.id);
    await expect(page).toHaveURL(/view=date/);
    await expect(page).toHaveURL(new RegExp(`date=${reservationDay}`));
    await expect(page).toHaveURL(new RegExp(`roomId=${room.id}`));
    await expect(page.getByTestId('reservation-date-timetable')).toBeVisible();
    await expect(page.getByTestId('reservation-date-timetable')).toContainText(room.name);
    await expect(page.getByTestId('reservation-date-timetable')).toContainText(purpose);

    await page.getByTestId('reservation-timetable-block').click();
    await expect(page).toHaveURL(new RegExp(`/admin/reservations/${reservation.id}$`));
  } finally {
    await cancelReservationByApi(request, reservation.id, 'e2e-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('room view shows a weekly timetable block and opens the reservation detail page', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('room-timetable-room');
  const reservationDay = nextWeekdayReservationLocalInputs({ daysAhead: 28, startHour: 15, endHour: 16 }).date;
  const weekStart = mondayOf(reservationDay);
  const reservation = await e2eData.createTestReservation(room.id, 'room-timetable', {
    startAt: `${reservationDay}T15:00:00+09:00`,
    endAt: `${reservationDay}T16:00:00+09:00`,
    memo: 'e2e-room-timetable-seed',
  });
  const purpose = reservation.purpose || '';

  try {
    await page.goto('/admin/timetable');
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
    await expect(page).toHaveURL(new RegExp(`/admin/reservations/${reservation.id}$`));
  } finally {
    await cancelReservationByApi(request, reservation.id, 'e2e-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('date view can create a reservation from an empty slot', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('date-quick-add-room');
  const purpose = e2eData.name('date-quick-add');
  const reservationDay = nextWeekdayReservationLocalInputs({ daysAhead: 35 }).date;
  let createdReservationId: string | undefined;

  try {
    await page.goto('/admin/timetable');
    await page.getByTestId('timetable-date-input').fill(reservationDay);
    await page.getByTestId('timetable-date-room-select').selectOption(room.id);

    await page.getByLabel(`${room.name} 12:00-12:30 예약 신청`).click();
    await expect(page.getByTestId('timetable-quick-add-panel')).toBeVisible();
    await expect(page.getByTestId('quick-add-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('quick-add-start-input')).toHaveValue(`${reservationDay}T12:00`);
    await expect(page.getByTestId('quick-add-end-input')).toHaveValue(`${reservationDay}T12:30`);

    await page.getByTestId('quick-add-applicant-name-input').fill('e2e-admin');
    await page.getByTestId('quick-add-email-input').fill(`e2e-quick-add-${Date.now()}@example.test`);
    await page.getByTestId('quick-add-phone-input').fill('010-3333-4444');
    await page.getByTestId('quick-add-purpose-input').fill(purpose);

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/reservations') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('quick-add-save-button').click();
    const createResponse = await createResponsePromise;
    const createResponseBody = await createResponse.text();
    const createRequestBody = JSON.parse(createResponse.request().postData() || '{}') as { roomId?: string };
    expect(createRequestBody.roomId).toBe(room.id);
    expect(createResponse.ok(), createResponseBody).toBeTruthy();
    createdReservationId = (JSON.parse(createResponseBody) as { id: string }).id;
    e2eData.registerReservation(createdReservationId);

    await expect(page.getByTestId('timetable-quick-add-panel')).toBeHidden();
    await expect(page.getByTestId('reservation-date-timetable')).toContainText(purpose);
  } finally {
    if (createdReservationId) {
      await cancelReservationByApi(request, createdReservationId, 'e2e-cleanup');
    }
    await deleteRoomByApi(request, room.id);
  }
});

test('toolbar request opens the shared panel without slot room context', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('toolbar-request-room');

  try {
    await page.goto('/admin/timetable');
    await page.getByTestId('timetable-date-room-select').selectOption(room.id);
    await page.getByTestId('timetable-new-request-button').click();

    await expect(page.getByTestId('timetable-quick-add-panel')).toBeVisible();
    await expect(page.getByTestId('quick-add-room-select')).toHaveValue('');
    await expect(page.getByTestId('quick-add-start-input')).not.toHaveValue('');
    await expect(page.getByTestId('quick-add-end-input')).not.toHaveValue('');
    await expect(page.getByTestId('quick-add-applicant-name-input')).toHaveValue('');
    await expect(page.getByTestId('quick-add-email-input')).toHaveValue('');
    await expect(page.getByTestId('quick-add-purpose-input')).toHaveValue('');
  } finally {
    await deleteRoomByApi(request, room.id);
  }
});

test('date view quick add defaults to the clicked room column', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('date-quick-add-select-room');
  const purpose = e2eData.name('date-quick-add-select-room');
  const reservationDay = nextWeekdayReservationLocalInputs({ daysAhead: 49 }).date;
  let createdReservationId: string | undefined;

  try {
    await page.goto('/admin/timetable');
    await page.getByTestId('timetable-date-input').fill(reservationDay);

    await page.getByRole('button', { name: new RegExp(`^${escapeRegExp(room.name)} 12:00-12:30`) }).click();
    await expect(page.getByTestId('timetable-quick-add-panel')).toBeVisible();
    await expect(page.getByTestId('quick-add-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('quick-add-start-input')).toHaveValue(`${reservationDay}T12:00`);
    await expect(page.getByTestId('quick-add-end-input')).toHaveValue(`${reservationDay}T12:30`);

    await page.getByTestId('quick-add-applicant-name-input').fill('e2e-admin');
    await page.getByTestId('quick-add-email-input').fill(`e2e-quick-add-select-room-${Date.now()}@example.test`);
    await page.getByTestId('quick-add-phone-input').fill('010-7777-8888');
    await page.getByTestId('quick-add-purpose-input').fill(purpose);

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/reservations') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('quick-add-save-button').click();
    const createResponse = await createResponsePromise;
    const createResponseBody = await createResponse.text();
    const createRequestBody = JSON.parse(createResponse.request().postData() || '{}') as { roomId?: string };
    expect(createRequestBody.roomId).toBe(room.id);
    expect(createResponse.ok(), createResponseBody).toBeTruthy();
    createdReservationId = (JSON.parse(createResponseBody) as { id: string }).id;
    e2eData.registerReservation(createdReservationId);

    await expect(page.getByTestId('timetable-quick-add-panel')).toBeHidden();
    await expect(page.getByTestId('reservation-date-timetable')).toContainText(purpose);
  } finally {
    if (createdReservationId) {
      await cancelReservationByApi(request, createdReservationId, 'e2e-cleanup');
    }
    await deleteRoomByApi(request, room.id);
  }
});

test('room view can create a reservation from an empty weekly slot', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('room-quick-add-room');
  const purpose = e2eData.name('room-quick-add');
  const reservationDay = nextWeekdayReservationLocalInputs({ daysAhead: 42 }).date;
  const weekStart = mondayOf(reservationDay);
  let createdReservationId: string | undefined;

  try {
    await page.goto('/admin/timetable');
    await page.getByTestId('timetable-view-room').click();
    await page.getByTestId('timetable-room-select').selectOption(room.id);
    await page.getByTestId('timetable-week-input').fill(weekStart);

    await page.getByTestId('timetable-empty-slot').nth(0).click();
    await expect(page.getByTestId('timetable-quick-add-panel')).toBeVisible();
    await expect(page.getByTestId('quick-add-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('quick-add-start-input')).toHaveValue(`${weekStart}T09:00`);
    await expect(page.getByTestId('quick-add-end-input')).toHaveValue(`${weekStart}T09:30`);

    await page.getByTestId('quick-add-applicant-name-input').fill('e2e-admin');
    await page.getByTestId('quick-add-email-input').fill(`e2e-quick-add-room-${Date.now()}@example.test`);
    await page.getByTestId('quick-add-phone-input').fill('010-5555-6666');
    await page.getByTestId('quick-add-purpose-input').fill(purpose);

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/reservations') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('quick-add-save-button').click();
    const createResponse = await createResponsePromise;
    const createResponseBody = await createResponse.text();
    expect(createResponse.ok(), createResponseBody).toBeTruthy();
    createdReservationId = (JSON.parse(createResponseBody) as { id: string }).id;
    e2eData.registerReservation(createdReservationId);

    await expect(page.getByTestId('timetable-quick-add-panel')).toBeHidden();
    await expect(page.getByTestId('reservation-room-timetable')).toContainText(purpose);
  } finally {
    if (createdReservationId) {
      await cancelReservationByApi(request, createdReservationId, 'e2e-cleanup');
    }
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
