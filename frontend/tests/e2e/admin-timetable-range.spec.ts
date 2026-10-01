import { expect, test } from './fixtures';
import {
  getSettingsByApi, updateSettingsByApi, nextWeekdayReservationLocalInputs,
  type E2eReservation,
} from './helpers';

const apiPath = '/api/admin/timetable/reservations';
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Real API/DB data through the shared fixture, including id-based teardown.
test('admin timetable returns and renders all 105 reservations per range', async ({ page, request, e2eData }, testInfo) => {
  test.setTimeout(180_000);
  const originalSettings = await getSettingsByApi(request);
  const nextDate = nextWeekdayReservationLocalInputs({ daysAhead: 21, startHour: 9, endHour: 10 }).date;
  const weekday = new Date(`${nextDate}T00:00:00Z`).getUTCDay();
  const monday = addDays(nextDate, 1 - weekday);
  const marker = e2eData.name('timetable-range');
  const rooms = [];
  const dayReservations: E2eReservation[] = [];
  const weekReservations: E2eReservation[] = [];
  try {
    await updateSettingsByApi(request, {
      ...originalSettings, openTime: '09:00', closeTime: '18:00', minReservationMinutes: 30,
      specialApprovalStartTime: '09:00', specialApprovalEndTime: '18:00',
      availableDaysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    });
    for (let index = 0; index < 7; index += 1) rooms.push(await e2eData.createTestRoom(`range-${index}`));
    for (let day = 0; day < 7; day += 1) {
      for (let slot = 0; slot < 15; slot += 1) {
        const minutes = 9 * 60 + slot * 30;
        const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
        const reservation = await e2eData.createTestReservation(rooms[0].id, `range-week-${day}-${slot}`, {
          memo: marker,
          startAt: `${addDays(monday, day)}T${clock(minutes)}:00+09:00`,
          endAt: `${addDays(monday, day)}T${clock(minutes + 30)}:00+09:00`,
        });
        weekReservations.push(reservation);
        if (day === 0) {
          dayReservations.push(reservation);
          for (const room of rooms.slice(1)) {
            dayReservations.push(await e2eData.createTestReservation(room.id, `range-day-${slot}`, {
              memo: marker,
              startAt: reservation.startAt, endAt: reservation.endAt,
            }));
          }
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const view of ['date', 'room'] as const) {
      const params = new URLSearchParams({ view, date: monday, keyword: marker, excludeCancelled: 'true' });
      if (view === 'room') params.set('roomId', rooms[0].id);
      const samples: number[] = [];
      let bytes = 0;
      for (let sample = 0; sample < 5; sample += 1) {
        const started = performance.now();
        const response = await request.get(`${apiPath}?${params}`);
        const body = await response.body();
        samples.push(Math.round((performance.now() - started) * 10) / 10);
        expect(response.ok()).toBe(true);
        bytes = body.byteLength;
        const items = JSON.parse(body.toString()) as Array<{ id: string }>;
        const expected = view === 'date' ? dayReservations : weekReservations;
        expect(new Set(items.map(item => item.id))).toEqual(new Set(expected.map(item => item.id)));
      }
      const requests: string[] = [];
      const listener = (requestEvent: import('@playwright/test').Request) => {
        if (new URL(requestEvent.url()).pathname === apiPath) requests.push(requestEvent.url());
      };
      page.on('request', listener);
      const loaded = performance.now();
      await page.goto(`/admin/timetable?view=${view}&date=${monday}&weekStart=${monday}&roomViewRoomId=${rooms[0].id}&keyword=${marker}`);
      const blocks = page.getByTestId(view === 'date' ? 'reservation-timetable-block' : 'reservation-room-timetable-block');
      await expect(blocks).toHaveCount(105);
      await expect(blocks.filter({ hasText: weekReservations[0].purpose })).toHaveCount(1);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const renderMs = Math.round(performance.now() - loaded);
      expect(requests).toHaveLength(1);
      expect(new URL(requests[0]).searchParams.has('size')).toBe(false);
      expect(new URL(requests[0]).searchParams.has('page')).toBe(false);
      await expect(page.getByText(/예약이 많아 일부만 표시/)).toHaveCount(0);
      page.off('request', listener);
      const metrics = { view, totalSeeded: 195, matched: 105, apiRoundTripMs: samples, responseBytes: bytes, navigationToPaintMs: renderMs };
      console.log(`admin_timetable_measurement=${JSON.stringify(metrics)}`);
      await testInfo.attach(`range-${view}-metrics`, { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    }
    await page.getByTestId('timetable-room-select').selectOption(rooms[1].id);
    await expect(page.getByTestId('reservation-room-timetable-block')).toHaveCount(15);
  } finally {
    const latest = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...originalSettings, version: latest.version });
  }
});

test('admin timetable isolates delayed ranges and hides failed queries including cached refetch failures', async ({ page, e2eData }) => {
  const room = await e2eData.createTestRoom('range-switch');
  const date = nextWeekdayReservationLocalInputs({ daysAhead: 21, startHour: 10, endHour: 11 }).date;
  const reservation = await e2eData.createTestReservation(room.id, 'range-switch', {
    startAt: `${date}T10:00:00+09:00`, endAt: `${date}T11:00:00+09:00`,
  });
  const day2 = addDays(date, 1);
  const day3 = addDays(date, 2);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let fail = false;
  let delayedStarted = false;
  await page.route(`**${apiPath}?**`, async route => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('date') === day2) {
      delayedStarted = true;
      await delayed;
      return route.fulfill({ json: [{ ...reservation, roomId: room.id, startAt: `${day2}T10:00:00+09:00`, endAt: `${day2}T11:00:00+09:00`, purpose: 'testing-stale-range' }] });
    }
    if (fail) return route.fulfill({ status: 503, json: { message: 'testing-range-query-failed' } });
    return route.continue();
  });
  await page.goto(`/admin/timetable?view=date&date=${date}&roomId=${room.id}`);
  await expect(page.getByTestId('reservation-timetable-block')).toHaveCount(1);
  await page.getByTestId('timetable-date-input').fill(day2);
  await expect.poll(() => delayedStarted).toBe(true);
  await expect(page.getByTestId('reservation-date-timetable')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '불러오는 중' })).toBeVisible();
  await page.getByTestId('timetable-date-input').fill(day3);
  await expect(page.getByTestId('reservation-date-timetable')).toBeVisible();
  await expect(page.getByTestId('reservation-timetable-block')).toHaveCount(0);
  const oldResponse = page.waitForResponse(response => new URL(response.url()).pathname === apiPath && new URL(response.url()).searchParams.get('date') === day2);
  release();
  await (await oldResponse).finished();
  await expect(page.getByText('testing-stale-range')).toHaveCount(0);
  await page.getByTestId('timetable-date-input').fill(date);
  await expect(page.getByTestId('reservation-timetable-block')).toHaveCount(1);
  fail = true;
  await page.clock.setFixedTime(new Date(Date.now() + 60_000));
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('reservation-date-timetable')).toHaveCount(0);
  await page.getByTestId('timetable-view-room').click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('reservation-room-timetable')).toHaveCount(0);
});

test('admin timetable refreshes after edit, approval, cancellation and deletion', async ({ page, e2eData }) => {
  const room = await e2eData.createTestRoom('range-mutations');
  const date = nextWeekdayReservationLocalInputs({ daysAhead: 21, startHour: 10, endHour: 11 }).date;
  const reservation = await e2eData.createTestPublicReservation(room.id, 'range-mutations', {
    startAt: `${date}T10:00:00+09:00`, endAt: `${date}T11:00:00+09:00`,
  });
  const timetableUrl = `/admin/timetable?view=date&date=${date}&roomId=${room.id}`;
  await page.goto(timetableUrl);
  const block = page.getByTestId('reservation-timetable-block');
  await expect(block).toContainText('승인 대기');
  await block.click();
  await page.getByRole('button', { name: '승인', exact: true }).click();
  await expect(page.locator('.reservation-detail-main .status-badge')).toHaveText('승인');
  await page.goBack();
  await expect(block).toContainText('승인');
  await expect(block).not.toContainText('승인 대기');
  await block.click();
  await page.getByTestId('reservation-edit-link').click();
  const updatedPurpose = e2eData.name('reservation-range-updated');
  await page.getByTestId('reservation-purpose-input').fill(updatedPurpose);
  await page.getByTestId('reservation-save-button').click();
  await expect(page.getByTestId('reservation-purpose')).toHaveText(updatedPurpose);
  await page.getByTestId('reservation-detail-timetable-link').click();
  await expect(block).toContainText(updatedPurpose);
  await block.click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.locator('.reservation-detail-main .status-badge')).toHaveText('취소');
  await page.goBack();
  await expect(block).toHaveCount(0);
  await page.goForward();
  await page.getByTestId('reservation-delete-button').click();
  await page.getByTestId('reservation-delete-confirm-button').click();
  await expect(page).toHaveURL(/\/admin\/audit\?/);
  const refresh = page.waitForResponse(response => new URL(response.url()).pathname === apiPath);
  await page.getByRole('link', { name: '시간표', exact: true }).click();
  expect((await refresh).ok()).toBe(true);
  await expect(page.getByTestId('reservation-date-timetable')).toBeVisible();
  await expect(block).toHaveCount(0);
});
