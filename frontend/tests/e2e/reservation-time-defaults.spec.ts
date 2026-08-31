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
      await mockReservationApis(page, '2026-07-31', {
        completionMessage: '   ',
        publicOpenTime: '09:00:00',
        publicCloseTime: '18:00:00',
      });

      await page.goto('/admin/timetable');
      await expect(page.getByTestId('timetable-new-request-button')).toBeVisible();
      await page.clock.setFixedTime(fixedInstant);
      await page.getByTestId('timetable-new-request-button').click();
      await expect(page.getByTestId('timetable-quick-add-panel').locator('.side-panel-header .muted')).toHaveText(
        '관리자는 예약을 승인 상태로 저장할 수 있으며, 과거 시간대의 예약도 등록할 수 있습니다.',
      );
      const adminStart = page.getByTestId('quick-add-start-input');
      const adminEnd = page.getByTestId('quick-add-end-input');
      await expect(page.getByTestId('quick-add-start-input-date')).toHaveValue(expectedStart.slice(0, 10));
      await expect(adminStart).toHaveValue('09:00');
      await expect(adminEnd).toHaveValue('09:30');
      await expect(adminEnd.locator('option[value="09:30"]')).toHaveText('09:30 (총 30분)');
      await expect(page.getByText('관리자는 신청을 바로 승인 상태로 저장할 수 있습니다.')).toBeVisible();
      await expect(page.getByText('선택한 날짜의 공간 예약 현황을 시간순으로 보여줍니다.')).toBeVisible();
      const adminSummary = page.getByTestId('reservation-date-timetable').locator('.timetable-summary');
      await expect(adminSummary).toContainText('운영 시간 09:00–18:00');
      await expect(adminSummary).not.toContainText('활성 공간');
      await expect(adminSummary).not.toContainText(/예약 \d+건/);
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
      const publicSummary = page.getByTestId('reservation-date-timetable').locator('.timetable-summary');
      await expect(publicSummary).toContainText('운영 시간 09:00–18:00');
      await expect(publicSummary).not.toContainText('신청 가능 시간');
      await expect(publicSummary).not.toContainText('활성 공간');
      await expect(publicSummary).not.toContainText(/예약 \d+건/);
      await page.getByTestId('public-new-request-button').click();
      await expect(page.getByTestId('public-quick-request-panel').locator('.side-panel-header .muted')).toHaveText(
        '신청은 승인 대기 상태로 저장됩니다.',
      );
      const publicStart = page.getByTestId('public-request-start-input');
      const publicEnd = page.getByTestId('public-request-end-input');
      await expect(page.getByTestId('public-request-start-input-date')).toHaveValue(expectedStart.slice(0, 10));
      await expect(publicStart).toHaveValue('09:00');
      await expect(publicEnd).toHaveValue('09:30');
      await expect(publicEnd.locator('option[value="09:30"]')).toHaveText('09:30 (총 30분)');
      await expect(page.getByText('시간표의 빈 칸을 누르면 해당 날짜, 시간, 공간으로 예약 신청 화면이 열립니다.'))
        .toBeVisible();
      await expect(page.getByText('선택한 날짜의 공간 예약 현황을 시간순으로 보여줍니다.')).toHaveCount(0);
      await expect(page.locator('.public-notice')).toHaveCount(0);
      await expect(page.getByTestId('public-request-status-select')).toHaveCount(0);

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
      const responsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/public/reservations') && response.request().method() === 'POST',
      );
      await page.getByTestId('public-request-submit-button').click();
      const createResponse = await responsePromise;
      const createRequest = createResponse.request();
      expect(createRequest.postDataJSON()).toMatchObject({
        startAt: '2026-07-15T10:00:00+09:00',
        endAt: '2026-07-15T10:30:00+09:00',
      });
      expect((await createResponse.json() as { status: string }).status).toBe('REQUESTED');
      await expect(page.getByTestId('public-quick-request-panel')).toBeHidden();
      const completionToast = page.getByTestId('public-reservation-success-toast');
      await expect(completionToast).toContainText(
        '예약 신청이 완료되었습니다. 관리자 승인 후 예약이 확정됩니다.',
      );
      await expect(page.getByRole('dialog', { name: '예약 신청 완료' })).toHaveCount(0);
    });
  });
}

test('public completion toast stays within mobile viewport and restarts its timeout', async ({ page }) => {
  const completionMessage = `testing-toast-first-line\n${'testing-toast-unbroken-'.repeat(12)}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockReservationApis(page, '2026-07-31', { completionMessage: `  ${completionMessage}  ` });
  await page.goto('/timetable');
  await page.clock.setFixedTime(fixedInstant);

  async function submitRequest(purpose: string) {
    await page.getByTestId('public-new-request-button').click();
    await page.getByTestId('public-request-start-input-date').fill('2026-07-15');
    await page.getByTestId('public-request-start-input').selectOption('10:00');
    await page.getByTestId('public-request-end-input').selectOption('10:30');
    await page.getByTestId('public-request-room-select').selectOption(room.id);
    await page.getByTestId('public-request-purpose-input').fill(purpose);
    await page.getByTestId('public-request-applicant-name-input').fill('testing-toast-user');
    await page.getByTestId('public-request-email-input').fill('testing-toast-user@example.test');
    await page.getByTestId('public-request-phone-input').fill('010-1234-5678');
    await page.getByTestId('public-request-cancel-password-input').fill('testing-password');
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/public/reservations') && response.request().method() === 'POST',
    );
    await page.getByTestId('public-request-submit-button').click();
    const response = await responsePromise;
    expect((await response.json() as { status: string }).status).toBe('REQUESTED');
    await expect(page.getByTestId('public-quick-request-panel')).toBeHidden();
  }

  await submitRequest('testing-toast-first');
  const toast = page.getByTestId('public-reservation-success-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveCSS('animation-name', 'public-reservation-toast-lifecycle-reduced');
  await expect(toast).toHaveCSS('white-space', 'pre-wrap');
  await expect(toast).toHaveCSS('overflow-wrap', 'anywhere');
  expect(await toast.locator('span').textContent()).toBe(completionMessage);
  const toastBox = await toast.boundingBox();
  expect(toastBox).not.toBeNull();
  expect(toastBox!.x).toBeGreaterThanOrEqual(0);
  expect(toastBox!.x + toastBox!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.waitForTimeout(3_000);
  await submitRequest('testing-toast-second');
  await page.waitForTimeout(3_500);
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 3_500 });
});

test('public disabled message preserves line breaks within the mobile viewport', async ({ page }) => {
  const disabledMessage = `testing-disabled-first-line\n${'testing-disabled-unbroken-'.repeat(12)}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await mockReservationApis(page, '2026-07-31', {
    reservationEnabled: false,
    reservationDisabledMessage: disabledMessage,
  });

  await page.goto('/timetable');
  const message = page.locator('.public-reservation-disabled-message');
  expect(await message.textContent()).toBe(disabledMessage);
  await expect(message).toHaveCSS('white-space', 'pre-wrap');
  await expect(message).toHaveCSS('overflow-wrap', 'anywhere');
  const messageBox = await message.boundingBox();
  expect(messageBox).not.toBeNull();
  expect(messageBox!.x).toBeGreaterThanOrEqual(0);
  expect(messageBox!.x + messageBox!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('public and admin timetable summaries use stable mobile rows without changing desktop layout', async ({ page }) => {
  await mockReservationApis(page, '2026-07-31', {
    publicOpenTime: '09:00',
    publicCloseTime: '18:00',
  });
  const cases = [
    { url: '/timetable?view=date&date=2026-07-13', testId: 'reservation-date-timetable' },
    { url: `/timetable?view=room&roomViewRoomId=${room.id}&weekStart=2026-07-13`, testId: 'reservation-room-timetable' },
    { url: '/admin/timetable?view=date&date=2026-07-13', testId: 'reservation-date-timetable' },
    { url: `/admin/timetable?view=room&roomViewRoomId=${room.id}&weekStart=2026-07-13`, testId: 'reservation-room-timetable' },
  ];

  await page.setViewportSize({ width: 390, height: 844 });
  for (const scenario of cases) {
    await page.goto(scenario.url);
    const summary = page.getByTestId(scenario.testId).locator('.timetable-summary');
    const details = summary.locator('.timetable-summary-details');
    const legend = details.locator('.timetable-availability-legend');
    const legendItems = legend.locator(':scope > span');
    const separator = details.locator('.timetable-summary-separator');
    const hours = details.locator(':scope > span').last();

    await expect(details).toHaveCSS('flex-direction', 'column');
    await expect(details).toHaveCSS('justify-content', 'flex-start');
    await expect(legend).toHaveCSS('flex-wrap', 'wrap');
    await expect(separator).toBeHidden();
    expect(await legendItems.evaluateAll((elements) =>
      elements.every((element) => getComputedStyle(element).whiteSpace === 'nowrap'))).toBe(true);

    const [detailsBox, legendBox, hoursBox, itemBoxes] = await Promise.all([
      details.boundingBox(),
      legend.boundingBox(),
      hours.boundingBox(),
      legendItems.evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y };
      })),
    ]);
    expect(detailsBox).not.toBeNull();
    expect(legendBox).not.toBeNull();
    expect(hoursBox).not.toBeNull();
    expect(Math.abs(legendBox!.x - detailsBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(hoursBox!.x - detailsBox!.x)).toBeLessThanOrEqual(1);
    expect(hoursBox!.y).toBeGreaterThanOrEqual(legendBox!.y + legendBox!.height - 1);
    expect(Math.max(...itemBoxes.map((box) => box.y)) - Math.min(...itemBoxes.map((box) => box.y)))
      .toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }

  await page.setViewportSize({ width: 1024, height: 768 });
  for (const scenario of cases) {
    await page.goto(scenario.url);
    const summary = page.getByTestId(scenario.testId).locator('.timetable-summary');
    const details = summary.locator('.timetable-summary-details');
    const legend = details.locator('.timetable-availability-legend');
    const separator = details.locator('.timetable-summary-separator');
    const hours = details.locator(':scope > span').last();

    await expect(summary).toHaveCSS('flex-direction', 'row');
    await expect(details).toHaveCSS('flex-direction', 'row');
    await expect(details).toHaveCSS('justify-content', 'flex-end');
    await expect(separator).toBeVisible();
    await expect(separator).toHaveText('|');
    const [summaryBox, detailsBox, legendBox, hoursBox] = await Promise.all([
      summary.boundingBox(), details.boundingBox(), legend.boundingBox(), hours.boundingBox(),
    ]);
    expect(summaryBox).not.toBeNull();
    expect(detailsBox).not.toBeNull();
    expect(legendBox).not.toBeNull();
    expect(hoursBox).not.toBeNull();
    expect(Math.abs(detailsBox!.x + detailsBox!.width - (summaryBox!.x + summaryBox!.width)))
      .toBeLessThanOrEqual(1);
    expect(Math.abs(
      legendBox!.y + legendBox!.height / 2 - (hoursBox!.y + hoursBox!.height / 2),
    )).toBeLessThanOrEqual(1);
  }
});

test('date and room timetables keep the 64px time column labels contained', async ({ page }) => {
  await mockReservationApis(page, '2026-07-31');
  const cases = [
    { url: '/timetable?view=date&date=2026-07-13', testId: 'reservation-date-timetable' },
    { url: `/timetable?view=room&roomViewRoomId=${room.id}&weekStart=2026-07-13`, testId: 'reservation-room-timetable' },
  ];

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const scenario of cases) {
      await page.goto(scenario.url);
      const timetable = page.getByTestId(scenario.testId);
      const grid = timetable.locator('.timetable-grid');
      const corner = grid.locator('.timetable-corner');
      const timeColumn = grid.locator('.timetable-time-column');
      const firstContentHeader = grid.locator('.timetable-room-header, .timetable-day-header').first();
      const labels = timeColumn.locator('.timetable-time-label');

      await expect(corner).toHaveCSS('width', '64px');
      await expect(labels.first()).toHaveCSS('right', '8px');
      const [columnBox, headerBox, labelMetrics] = await Promise.all([
        timeColumn.boundingBox(),
        firstContentHeader.boundingBox(),
        labels.evaluateAll((elements) => elements.map((element) => {
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            textFits: element.scrollWidth <= element.clientWidth + 1,
          };
        })),
      ]);
      if (!columnBox || !headerBox) throw new Error('Could not measure timetable time column.');
      expect(columnBox.width).toBe(64);
      expect(Math.abs(columnBox.x + columnBox.width - headerBox.x)).toBeLessThanOrEqual(1);
      expect(labelMetrics.every((label) => (
        label.left >= columnBox.x - 1
        && label.right <= columnBox.x + columnBox.width + 1
        && label.right <= headerBox.x + 1
        && label.textFits
      ))).toBe(true);
      if (viewport.width === 390) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
  }
});

test('public blocks unavailable future suggestions while admin allows manual past input', async ({ page }) => {
  await mockReservationApis(page, '2026-07-13');

  await page.goto('/admin/timetable');
  await expect(page.getByTestId('timetable-new-request-button')).toBeVisible();
  await page.clock.setFixedTime(fixedInstant);
  await page.getByTestId('timetable-new-request-button').click();
  await expect(page.getByTestId('reservation-time-unavailable')).toHaveCount(0);
  await expect(page.getByTestId('timetable-quick-add-panel').locator('.side-panel-header .muted')).toHaveText(
    '관리자는 예약을 승인 상태로 저장할 수 있으며, 과거 시간대의 예약도 등록할 수 있습니다.',
  );
  await expect(page.getByTestId('quick-add-start-input')).toHaveValue('');
  await expect(page.getByTestId('quick-add-end-input')).toHaveValue('');
  await expect(page.getByTestId('quick-add-save-button')).toBeEnabled();
  await page.getByTestId('timetable-quick-add-close').click();

  await page.goto('/timetable');
  await page.getByTestId('public-new-request-button').click();
  await expect(page.getByTestId('public-quick-request-panel').locator('.side-panel-header .muted')).toHaveText(
    '신청은 승인 대기 상태로 저장됩니다.',
  );
  await expect(page.getByTestId('reservation-time-unavailable')).toContainText(
    '설정된 예약 가능 기간에 예약 가능한 미래 운영 시간이 없습니다. 운영 설정을 확인해 주세요.',
  );
  await expect(page.getByTestId('reservation-time-unavailable')).not.toContainText('학기');
  await expect(page.getByTestId('public-request-start-input')).toHaveValue('');
  await expect(page.getByTestId('public-request-end-input')).toHaveValue('');
  await expect(page.getByTestId('public-request-submit-button')).toBeDisabled();
});

for (const policy of [
  { minReservationMinutes: 30, expectedEnd: '09:30' },
  { minReservationMinutes: 45, expectedEnd: '09:45' },
  { minReservationMinutes: 60, expectedEnd: '10:00' },
  { minReservationMinutes: 120, expectedEnd: '11:00' },
]) {
  test(`minimum ${policy.minReservationMinutes} uses its duration with a one-cell hover in both timetable views`, async ({ page }) => {
    await mockReservationApis(page, '2026-07-31', policy);
    const date = '2026-07-13';

    await page.goto(`/admin/timetable?view=date&date=${date}`);
    const dateCandidate = page.getByRole('button', {
      name: `${room.name} 09:00-${policy.expectedEnd} 예약 신청`,
    });
    await dateCandidate.hover();
    expect(await dateCandidate.evaluate((element) => getComputedStyle(element, '::before').height))
      .toBe('48px');
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
      .toBe('48px');
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
  await expect(page.getByTestId('public-quick-request-panel').locator('.side-panel-header .muted')).toHaveText(
    '신청은 승인 대기 상태로 저장됩니다.',
  );
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
  await page.evaluate(() => {
    document.body.style.zoom = '2';
  });
  const submitError = page.getByTestId('public-quick-request-panel').locator('.quick-add-submit-error');
  expect(await submitError.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  await page.evaluate(() => {
    document.body.style.zoom = '';
  });
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
  await expect(page.getByTestId('timetable-quick-add-panel').locator('.side-panel-header .muted')).toHaveText(
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

test('public and admin timetables share availability colors but keep different interaction rules', async ({ page }) => {
  const publicNoticeMessage = `testing-public-notice-first-line\n${'testing-public-notice-unbroken-'.repeat(12)}`;
  await mockReservationApis(page, '2026-07-31', {
    publicOpenTime: '10:00',
    publicCloseTime: '17:00',
    publicAvailableDaysOfWeek: ['TUESDAY', 'WEDNESDAY', 'THURSDAY'],
    publicNotice: `  ${publicNoticeMessage}  `,
  });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/timetable?view=date&date=2026-07-13');
  const publicNotice = page.locator('.public-notice');
  const publicNoticeText = publicNotice.locator('.public-notice-message');
  expect(await publicNoticeText.textContent()).toBe(publicNoticeMessage);
  await expect(publicNoticeText).toHaveCSS('white-space', 'pre-wrap');
  await expect(publicNoticeText).toHaveCSS('overflow-wrap', 'anywhere');
  await expect(publicNotice).not.toContainText('신청 가능 시간');
  await expect(publicNotice).not.toContainText('승인 대기');
  const publicNoticeBox = await publicNotice.boundingBox();
  expect(publicNoticeBox).not.toBeNull();
  expect(publicNoticeBox!.x).toBeGreaterThanOrEqual(0);
  expect(publicNoticeBox!.x + publicNoticeBox!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const publicDateSummary = page.getByTestId('reservation-date-timetable').locator('.timetable-summary');
  await expect(publicDateSummary).toContainText('운영 시간 09:00–18:00 · 신청 가능 시간 10:00–17:00');
  await expect(publicDateSummary).not.toContainText('활성 공간');
  await expect(publicDateSummary).not.toContainText(/예약 \d+건/);
  await expect(page.getByText('선택한 날짜의 공간 예약 현황을 시간순으로 보여줍니다.')).toHaveCount(0);
  await expect(page.getByText('공개 예약 불가', { exact: true })).toBeVisible();
  await expect(page.getByText('운영하지 않음', { exact: true })).toBeVisible();
  await expect(page.locator('.timetable-availability-legend i.public-unavailable')).toHaveCSS(
    'background-color',
    'rgb(253, 247, 246)',
  );
  expect(
    await page.locator('.timetable-availability-legend i.operating-unavailable')
      .evaluate((element) => getComputedStyle(element, '::before').content.replace(/["']/g, '')),
  ).toBe('×');
  await expect(page.getByRole('button', { name: `${room.name} 10:00-10:30 예약 신청` })).toHaveCount(0);
  const publicUnavailableColumn = page.locator('.timetable-room-column.availability-public-unavailable');
  await expect(publicUnavailableColumn).toHaveCount(1);
  await expect(publicUnavailableColumn).toHaveCSS('background-color', 'rgb(253, 247, 246)');
  await expect(publicUnavailableColumn).toHaveCSS('border-left-width', '1px');
  const publicUnavailableGridLine = publicUnavailableColumn.locator('.timetable-grid-line').first();
  await expect(publicUnavailableGridLine).toHaveCSS('z-index', '1');
  await expect(publicUnavailableGridLine).toHaveCSS('background-color', 'rgb(237, 241, 245)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`/timetable?view=room&roomViewRoomId=${room.id}&weekStart=2026-07-13`);
  const publicRoomSummary = page.getByTestId('reservation-room-timetable').locator('.timetable-summary');
  await expect(publicRoomSummary).toContainText('운영 시간 09:00–18:00 · 신청 가능 시간 10:00–17:00');
  await expect(publicRoomSummary).not.toContainText(/예약 \d+건/);
  await expect(page.getByText('선택한 공간의 예약 현황을 날짜와 시간 기준으로 보여줍니다.')).toHaveCount(0);
  const publicUnavailableHeader = page.locator('.timetable-day-header.availability-public-unavailable').first();
  const weeklyPublicUnavailableColumn = page.locator('.timetable-room-column.availability-public-unavailable').first();
  const availableHeader = page.locator('.timetable-day-header.availability-available').first();
  await expect(publicUnavailableHeader).toHaveCSS(
    'background-color',
    await availableHeader.evaluate((element) => getComputedStyle(element).backgroundColor),
  );
  await expect(weeklyPublicUnavailableColumn).toHaveCSS('background-color', 'rgb(253, 247, 246)');
  const operatingUnavailableHeader = page.locator('.timetable-day-header.availability-operating-unavailable').first();
  const weeklyOperatingUnavailableColumn = page.locator('.timetable-room-column.availability-operating-unavailable').first();
  await expect(operatingUnavailableHeader).toHaveCSS(
    'background-color',
    await availableHeader.evaluate((element) => getComputedStyle(element).backgroundColor),
  );
  await expect(weeklyOperatingUnavailableColumn).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const weeklyOperatingSlots = weeklyOperatingUnavailableColumn.locator(
    '.timetable-unavailable-slot.availability-operating-unavailable',
  );
  expect(await weeklyOperatingSlots.count()).toBeGreaterThan(0);
  expect(
    await weeklyOperatingSlots.evaluateAll((elements) => elements.every(
      (element) => getComputedStyle(element, '::after').content.replace(/["']/g, '') === '×',
    )),
  ).toBe(true);

  await page.goto('/timetable?view=date&date=2026-07-14');
  await expect(page.getByRole('button', { name: `${room.name} 09:30-10:00 예약 신청` })).toHaveCount(0);
  await expect(page.getByRole('button', { name: `${room.name} 10:00-10:30 예약 신청` })).toBeEnabled();
  await expect(page.getByRole('button', { name: `${room.name} 16:30-17:00 예약 신청` })).toBeEnabled();
  await expect(page.getByRole('button', { name: `${room.name} 17:00-17:30 예약 신청` })).toHaveCount(0);

  await page.goto('/timetable?view=date&date=2026-07-12');
  await expect(page.getByRole('button', { name: `${room.name} 10:00-10:30 예약 신청` })).toHaveCount(0);
  const publicOperatingColumn = page.locator('.timetable-room-column.availability-operating-unavailable');
  await expect(publicOperatingColumn).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const publicOperatingSlots = publicOperatingColumn.locator(
    '.timetable-unavailable-slot.availability-operating-unavailable',
  );
  expect(await publicOperatingSlots.count()).toBeGreaterThan(0);
  expect(
    await publicOperatingSlots.evaluateAll((elements) => elements.every(
      (element) => getComputedStyle(element, '::after').content.replace(/["']/g, '') === '×',
    )),
  ).toBe(true);

  await page.goto('/admin/timetable?view=date&date=2026-07-13');
  await expect(page.getByText('선택한 날짜의 공간 예약 현황을 시간순으로 보여줍니다.')).toBeVisible();
  const adminDateSummary = page.getByTestId('reservation-date-timetable').locator('.timetable-summary');
  await expect(adminDateSummary).toContainText('운영 시간 09:00–18:00 · 신청 가능 시간 10:00–17:00');
  await expect(adminDateSummary).not.toContainText('활성 공간');
  await expect(adminDateSummary).not.toContainText(/예약 \d+건/);
  const adminPublicUnavailable = page.getByRole('button', { name: `${room.name} 10:00-10:30 예약 신청` });
  await expect(adminPublicUnavailable).toBeEnabled();
  await expect(adminPublicUnavailable).toHaveClass(/availability-public-unavailable/);

  await page.goto('/admin/timetable?view=date&date=2026-07-12');
  await expect(page.getByRole('button', { name: `${room.name} 10:00-10:30 예약 신청` })).toHaveCount(0);
  const adminOperatingColumn = page.locator('.timetable-room-column.availability-operating-unavailable');
  await expect(adminOperatingColumn).toHaveCount(1);
  await expect(adminOperatingColumn).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(
    await adminOperatingColumn.locator('.timetable-unavailable-slot.availability-operating-unavailable')
      .evaluateAll((elements) => elements.every(
        (element) => getComputedStyle(element, '::after').content.replace(/["']/g, '') === '×',
      )),
  ).toBe(true);
});

async function mockReservationApis(
  page: Page,
  semesterEndDate: string,
  overrides: Partial<{
    reservationEnabled: boolean;
    reservationDisabledMessage: string | null;
    minReservationMinutes: number;
    maxReservationMinutes: number;
    publicOpenTime: string;
    publicCloseTime: string;
    availableDaysOfWeek: string[];
    publicAvailableDaysOfWeek: string[];
    publicNotice: string | null;
    completionMessage: string | null;
  }> = {},
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
    publicOpenTime: '09:00',
    publicCloseTime: '18:00',
    slotMinutes: 5,
    availableDaysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    publicAvailableDaysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
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
