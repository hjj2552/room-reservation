import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const fixedInstant = new Date('2026-07-13T15:45:00Z'); // 2026-07-14 00:45 Asia/Seoul
const expectedStart = '2026-07-14T09:00';
const expectedEnd = '2026-07-14T09:30';
const publicPastMessage = '이미 지난 시간에는 예약할 수 없습니다. 예약 시간을 다시 확인해 주세요.';
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
      await expect(page.getByTestId('quick-add-start-input-date')).toHaveValue(expectedStart.slice(0, 10));
      await expect(adminStart).toHaveValue('09:00');
      await expect(adminEnd).toHaveValue('09:30');
      await expect(adminStart.locator('option[value="09:05"]')).toHaveCount(1);
      await expect(adminStart.locator('option[value="09:01"]')).toHaveCount(0);

      await page.getByTestId('quick-add-start-input-date').fill('2026-07-15');
      await adminStart.selectOption('10:00');
      await adminEnd.selectOption('10:30');
      await page.getByTestId('quick-add-room-select').selectOption(room.id);
      await expect(adminStart).toHaveValue('10:00');
      await expect(adminEnd).toHaveValue('10:30');
      await page.getByTestId('timetable-quick-add-close').click();

      await page.goto('/timetable');
      await page.getByTestId('public-new-request-button').click();
      const publicStart = page.getByTestId('public-request-start-input');
      const publicEnd = page.getByTestId('public-request-end-input');
      await expect(page.getByTestId('public-request-start-input-date')).toHaveValue(expectedStart.slice(0, 10));
      await expect(publicStart).toHaveValue('09:00');
      await expect(publicEnd).toHaveValue('09:30');

      await page.getByTestId('public-request-start-input-date').fill('2026-07-15');
      await publicStart.selectOption('10:00');
      await publicEnd.selectOption('10:30');
      await page.getByTestId('public-request-room-select').selectOption(room.id);
      await expect(publicStart).toHaveValue('10:00');
      await expect(publicEnd).toHaveValue('10:30');
      await publicStart.selectOption('17:30');
      await expect(publicEnd).toHaveValue('');
      await publicStart.selectOption('10:00');
      await publicEnd.selectOption('10:30');

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

test('public blocks unavailable future suggestions while admin allows manual past input', async ({ page }) => {
  await mockReservationApis(page, '2026-07-13');

  await page.goto('/admin/timetable');
  await expect(page.getByTestId('timetable-new-request-button')).toBeVisible();
  await page.clock.setFixedTime(fixedInstant);
  await page.getByTestId('timetable-new-request-button').click();
  await expect(page.getByTestId('reservation-time-unavailable')).toHaveCount(0);
  await expect(page.getByTestId('timetable-quick-add-panel')).toContainText(
    '관리자는 예약을 승인 상태로 저장할 수 있으며, 과거 시간대의 예약도 등록할 수 있습니다.',
  );
  await expect(page.getByTestId('quick-add-start-input')).toHaveValue('');
  await expect(page.getByTestId('quick-add-end-input')).toHaveValue('');
  await expect(page.getByTestId('quick-add-save-button')).toBeEnabled();
  await page.getByTestId('timetable-quick-add-close').click();

  await page.goto('/timetable');
  await page.getByTestId('public-new-request-button').click();
  await expect(page.getByTestId('reservation-time-unavailable')).toContainText('예약 가능한 미래 운영 시간이 없습니다');
  await expect(page.getByTestId('public-request-start-input')).toHaveValue('');
  await expect(page.getByTestId('public-request-end-input')).toHaveValue('');
  await expect(page.getByTestId('public-request-submit-button')).toBeDisabled();
});

for (const policy of [
  { minReservationMinutes: 30, expectedEnd: '09:30', expectedHeight: '48px' },
  { minReservationMinutes: 45, expectedEnd: '09:45', expectedHeight: '72px' },
  { minReservationMinutes: 60, expectedEnd: '10:00', expectedHeight: '96px' },
  { minReservationMinutes: 120, expectedEnd: '11:00', expectedHeight: '192px' },
]) {
  test(`minimum ${policy.minReservationMinutes} uses the full suggestion in both timetable views`, async ({ page }) => {
    await mockReservationApis(page, '2026-07-31', policy);
    const date = '2026-07-13';

    await page.goto(`/admin/timetable?view=date&date=${date}`);
    const dateCandidate = page.getByRole('button', {
      name: `${room.name} 09:00-${policy.expectedEnd} 예약 신청`,
    });
    await dateCandidate.hover();
    expect(await dateCandidate.evaluate((element) => getComputedStyle(element, '::before').height))
      .toBe(policy.expectedHeight);
    await dateCandidate.click();
    await expect(page.getByTestId('quick-add-start-input-date')).toHaveValue(date);
    await expect(page.getByTestId('quick-add-start-input')).toHaveValue('09:00');
    await expect(page.getByTestId('quick-add-end-input')).toHaveValue(policy.expectedEnd);
    await page.getByTestId('timetable-quick-add-close').click();

    await page.getByTestId('timetable-view-room').click();
    const roomCandidate = page.getByRole('button', {
      name: `${room.name} 월 09:00-${policy.expectedEnd} 예약 신청`,
    });
    await roomCandidate.hover();
    expect(await roomCandidate.evaluate((element) => getComputedStyle(element, '::before').height))
      .toBe(policy.expectedHeight);
    await roomCandidate.click();
    await expect(page.getByTestId('quick-add-start-input')).toHaveValue('09:00');
    await expect(page.getByTestId('quick-add-end-input')).toHaveValue(policy.expectedEnd);
  });
}

test('public and admin can open a past slot while public submission shows the policy error', async ({ page }) => {
  await mockReservationApis(page, '2026-07-31');
  let publicCreateRequests = 0;
  await page.route('**/api/public/reservations', (route) => {
    publicCreateRequests += 1;
    return route.fulfill({
    status: 422,
    json: {
      code: 'PAST_RESERVATION_TIME',
      message: publicPastMessage,
      timestamp: '2026-07-13T01:15:00Z',
      path: '/api/public/reservations',
      fieldErrors: [],
    },
    });
  });
  await page.clock.setFixedTime(new Date('2026-07-13T01:15:00Z')); // 10:15 Asia/Seoul

  await page.goto('/timetable?view=date&date=2026-07-13');
  const publicPastSlot = page.getByRole('button', { name: new RegExp(`${room.name} 09:00-09:30`) });
  await expect(publicPastSlot).toBeEnabled();
  await publicPastSlot.hover();
  expect(await publicPastSlot.evaluate((element) => getComputedStyle(element, '::before').height)).toBe('48px');
  await publicPastSlot.click();
  await expect(page.getByTestId('public-request-start-input-date')).toHaveValue('2026-07-13');
  await expect(page.getByTestId('public-request-start-input')).toHaveValue('09:00');
  await expect(page.getByTestId('public-request-end-input')).toHaveValue('09:30');
  await expect(page.getByRole('button', { name: `${room.name} 10:30-11:00 예약 신청` })).toBeEnabled();

  await page.getByTestId('public-request-purpose-input').fill('testing-reservation-public-past');
  await page.getByTestId('public-request-applicant-name-input').fill('testing-user');
  await page.getByTestId('public-request-email-input').fill('testing-user@example.test');
  await page.getByTestId('public-request-phone-input').fill('010-1234-5678');
  await page.getByTestId('public-request-cancel-password-input').fill('testing-password');
  await page.getByTestId('public-request-submit-button').click();
  await expect(page.getByTestId('public-quick-request-panel')).toContainText(publicPastMessage);
  expect(publicCreateRequests).toBe(0);

  await page.goto('/admin/timetable?view=date&date=2026-07-13');
  let adminCreateRequests = 0;
  await page.route('**/api/admin/reservations', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    adminCreateRequests += 1;
    return route.fulfill({
      status: 201,
      json: { id: '00000000-0000-0000-0000-000000000301' },
    });
  });
  const adminPastSlot = page.getByRole('button', { name: `${room.name} 09:00-09:30 예약 신청` });
  await expect(adminPastSlot).toBeEnabled();
  await adminPastSlot.click();
  await expect(page.getByTestId('quick-add-start-input-date')).toHaveValue('2026-07-13');
  await expect(page.getByTestId('quick-add-start-input')).toHaveValue('09:00');
  await expect(page.getByTestId('timetable-quick-add-panel')).toContainText(
    '관리자는 예약을 승인 상태로 저장할 수 있으며, 과거 시간대의 예약도 등록할 수 있습니다.',
  );
  await page.getByTestId('quick-add-applicant-name-input').fill('testing-admin');
  await page.getByTestId('quick-add-email-input').fill('testing-admin@example.test');
  await page.getByTestId('quick-add-phone-input').fill('010-5555-5555');
  await page.getByTestId('quick-add-purpose-input').fill('testing-reservation-admin-past');
  await page.getByTestId('quick-add-save-button').click();
  await expect(page.getByTestId('timetable-quick-add-panel')).toBeHidden();
  expect(adminCreateRequests).toBe(1);
});

test('empty slot hover fills the 30-minute grid cell when minimum duration is shorter', async ({ page }) => {
  await mockReservationApis(page, '2026-07-31', { minReservationMinutes: 10 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/timetable?view=date&date=2026-07-13');

  const slot = page.getByRole('button', { name: new RegExp(`${room.name} 09:00-09:10`) });
  await slot.hover();

  const sizes = await slot.evaluate((element) => ({
    slotHeight: element.getBoundingClientRect().height,
    hoverHeight: Number.parseFloat(getComputedStyle(element, '::before').height),
  }));
  expect(sizes.hoverHeight).toBe(sizes.slotHeight);
  expect(sizes.slotHeight).toBe(48);
});

async function mockReservationApis(
  page: Page,
  semesterEndDate: string,
  overrides: Partial<{ minReservationMinutes: number; maxReservationMinutes: number }> = {},
) {
  const settings = {
    organizationName: 'testing-organization',
    publicNotice: null,
    reservationEnabled: true,
    reservationDisabledMessage: null,
    semesterStartDate: '2026-07-01',
    semesterEndDate,
    openTime: '09:00',
    closeTime: '18:00',
    slotMinutes: 5,
    availableDaysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    minReservationMinutes: 30,
    maxReservationMinutes: 240,
    adminContactEmail: null,
    adminContactPhone: null,
    completionMessage: null,
    version: 1,
    ...overrides,
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
