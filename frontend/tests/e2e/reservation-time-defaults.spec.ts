import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const fixedInstant = new Date('2026-07-13T15:45:00Z'); // 2026-07-14 00:45 Asia/Seoul
const expectedStart = '2026-07-14T09:00';
const expectedEnd = '2026-07-14T09:30';
const room = {
  id: '00000000-0000-0000-0000-000000000101',
  name: 'testing-room-time-default',
  location: 'testing-building',
  capacity: 30,
  description: 'testing-room-time-default-description',
  enabled: true,
  deleted: false,
  createdAt: '2026-07-01T00:00:00+09:00',
  updatedAt: '2026-07-01T00:00:00+09:00',
  deletedAt: null,
};

for (const timezoneId of ['Asia/Seoul', 'UTC']) {
  test.describe(`toolbar reservation defaults in ${timezoneId}`, () => {
    test.use({ timezoneId });

    test('admin and public panels use the same exact Seoul time and preserve manual edits', async ({ page }) => {
      await mockReservationApis(page, '2026-07-31');

      await page.goto('/admin/timetable');
      await expect(page.getByTestId('timetable-new-request-button')).toBeVisible();
      await page.clock.setFixedTime(fixedInstant);
      await page.getByTestId('timetable-new-request-button').click();
      const adminStart = page.getByTestId('quick-add-start-input');
      const adminEnd = page.getByTestId('quick-add-end-input');
      await expect(adminStart).toHaveValue(expectedStart);
      await expect(adminEnd).toHaveValue(expectedEnd);

      await adminStart.fill('2026-07-15T10:00');
      await adminEnd.fill('2026-07-15T10:30');
      await page.getByTestId('quick-add-room-select').selectOption(room.id);
      await expect(adminStart).toHaveValue('2026-07-15T10:00');
      await expect(adminEnd).toHaveValue('2026-07-15T10:30');
      await page.getByTestId('timetable-quick-add-close').click();

      await page.goto('/timetable');
      await page.getByTestId('public-new-request-button').click();
      const publicStart = page.getByTestId('public-request-start-input');
      const publicEnd = page.getByTestId('public-request-end-input');
      await expect(publicStart).toHaveValue(expectedStart);
      await expect(publicEnd).toHaveValue(expectedEnd);

      await publicStart.fill('2026-07-15T10:00');
      await publicEnd.fill('2026-07-15T10:30');
      await page.getByTestId('public-request-room-select').selectOption(room.id);
      await expect(publicStart).toHaveValue('2026-07-15T10:00');
      await expect(publicEnd).toHaveValue('2026-07-15T10:30');

      await page.getByTestId('public-request-purpose-input').fill('testing-reservation-time-default');
      await page.getByTestId('public-request-applicant-name-input').fill('testing-user');
      await page.getByTestId('public-request-email-input').fill('testing-user@example.test');
      await page.getByTestId('public-request-phone-input').fill('010-1234-5678');
      await page.getByTestId('public-request-cancel-password-input').fill('testing-password');
      const requestPromise = page.waitForRequest((request) =>
        request.url().includes('/api/public/reservations') && request.method() === 'POST',
      );
      await page.getByTestId('public-request-submit-button').click();
      const createRequest = await requestPromise;
      expect(createRequest.postDataJSON()).toMatchObject({
        startAt: '2026-07-15T10:00:00+09:00',
        endAt: '2026-07-15T10:30:00+09:00',
      });
    });
  });
}

test('panels explain and block submission when the semester has no future slot', async ({ page }) => {
  await mockReservationApis(page, '2026-07-13');

  await page.goto('/admin/timetable');
  await expect(page.getByTestId('timetable-new-request-button')).toBeVisible();
  await page.clock.setFixedTime(fixedInstant);
  await page.getByTestId('timetable-new-request-button').click();
  await expect(page.getByTestId('reservation-time-unavailable')).toContainText('예약 가능한 미래 운영 시간이 없습니다');
  await expect(page.getByTestId('quick-add-start-input')).toHaveValue('');
  await expect(page.getByTestId('quick-add-end-input')).toHaveValue('');
  await expect(page.getByTestId('quick-add-save-button')).toBeDisabled();
  await page.getByTestId('timetable-quick-add-close').click();

  await page.goto('/timetable');
  await page.getByTestId('public-new-request-button').click();
  await expect(page.getByTestId('reservation-time-unavailable')).toContainText('예약 가능한 미래 운영 시간이 없습니다');
  await expect(page.getByTestId('public-request-start-input')).toHaveValue('');
  await expect(page.getByTestId('public-request-end-input')).toHaveValue('');
  await expect(page.getByTestId('public-request-submit-button')).toBeDisabled();
});

async function mockReservationApis(page: Page, semesterEndDate: string) {
  const settings = {
    organizationName: 'testing-organization',
    publicNotice: null,
    reservationEnabled: true,
    reservationDisabledMessage: null,
    semesterStartDate: '2026-07-01',
    semesterEndDate,
    openTime: '09:00',
    closeTime: '18:00',
    slotMinutes: 30,
    availableDaysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    minReservationMinutes: 30,
    maxReservationMinutes: 240,
    adminContactEmail: null,
    adminContactPhone: null,
    completionMessage: null,
    version: 1,
  };
  const emptyPage = { items: [], page: 0, size: 500, totalItems: 0, totalPages: 0 };

  await page.route('**/api/admin/settings', (route) => route.fulfill({ json: settings }));
  await page.route('**/api/public/settings', (route) => {
    const { version: _version, ...publicSettings } = settings;
    return route.fulfill({ json: publicSettings });
  });
  await page.route('**/api/admin/rooms**', (route) => route.fulfill({
    json: { ...emptyPage, items: [room], totalItems: 1, totalPages: 1 },
  }));
  await page.route('**/api/admin/reservations**', (route) => route.fulfill({ json: emptyPage }));
  await page.route('**/api/public/rooms', (route) => route.fulfill({
    json: [{
      id: room.id,
      name: room.name,
      location: room.location,
      capacity: room.capacity,
      description: room.description,
    }],
  }));
  await page.route('**/api/public/rooms/*/weekly**', (route) => {
    const weekStart = new URL(route.request().url()).searchParams.get('weekStart') || '2026-07-13';
    return route.fulfill({
      json: {
        room: { id: room.id, name: room.name, location: room.location },
        weekStart,
        weekEnd: '2026-07-19',
        reservations: [],
      },
    });
  });
  await page.route('**/api/public/reservations', (route) => route.fulfill({
    status: 201,
    json: { id: '00000000-0000-0000-0000-000000000201', status: 'REQUESTED', message: null },
  }));
}
