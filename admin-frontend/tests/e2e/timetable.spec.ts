import { expect, test } from '@playwright/test';
import {
  cancelReservationByApi,
  createReservationByApi,
  createRoomByApi,
  deleteRoomByApi,
  loginByApi,
  nextWeekdayReservationLocalInputs,
  uniqueE2eName,
} from './helpers';

test('date view shows a timetable block and opens the reservation detail page', async ({ page, request }) => {
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

test('room view shows a weekly timetable block and opens the reservation detail page', async ({ page, request }) => {
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

function mondayOf(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}
