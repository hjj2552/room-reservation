import { expect, test } from './fixtures';
import { getSettingsByApi, nextWeekdayReservationLocalInputs, updateSettingsByApi } from './helpers';

test('public timetable supports slot-based request, detail, and password cancellation', async ({ page, request, e2eData }) => {
  const originalSettings = await getSettingsByApi(request);
  await updateSettingsByApi(request, {
    ...originalSettings,
    reservationEnabled: true,
    reservationDisabledMessage: originalSettings.reservationDisabledMessage || 'Reservation is currently disabled.',
  });
  const room = await e2eData.createTestRoom('public-request-room');
  const reservationTime = nextWeekdayReservationLocalInputs({ daysAhead: 21, startHour: 10, endHour: 11 });
  const applicantName = e2eData.name('public-applicant');
  const purpose = e2eData.name('public-purpose');
  const email = `${e2eData.name('public-email')}@example.test`;
  const cancelPassword = 'e2e-public-password';

  try {
    await page.goto('/public/reservations/new');
    await page.getByTestId('public-timetable-view-room').click();
    await page.getByTestId('public-timetable-room-select').selectOption(room.id);
    await page.getByTestId('public-timetable-week-input').fill(reservationTime.date);

    await page.getByTestId('timetable-empty-slot').first().click();
    await expect(page.getByTestId('public-quick-request-panel')).toBeVisible();
    await expect(page.getByTestId('public-request-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('public-request-start-input')).not.toHaveValue('');
    await expect(page.getByTestId('public-request-end-input')).not.toHaveValue('');

    await page.getByTestId('public-request-applicant-name-input').fill(applicantName);
    await page.getByTestId('public-request-email-input').fill(email);
    await page.getByTestId('public-request-phone-input').fill('010-3333-4444');
    await page.getByTestId('public-request-purpose-input').fill(purpose);
    await page.getByTestId('public-request-cancel-password-input').fill(cancelPassword);

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/public/reservations') &&
      response.request().method() === 'POST' &&
      !response.url().includes('/cancel'),
    );
    await page.getByTestId('public-request-submit-button').click();
    const createResponse = await createResponsePromise;
    const createResponseBody = await createResponse.text();
    expect(createResponse.ok(), createResponseBody).toBeTruthy();
    const created = JSON.parse(createResponseBody) as { id: string; status: string };
    expect(created.status).toBe('REQUESTED');
    e2eData.registerReservation(created.id);

    await expect(page.getByTestId('public-quick-request-panel')).toBeHidden();
    await expect(page.getByText(purpose)).toBeVisible();
    await page.getByText(purpose).click();

    await expect(page.getByRole('dialog', { name: '상세 정보' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: '상세 정보' })).toContainText('신청 대기');
    await page.getByRole('button', { name: '예약 신청 취소' }).click();
    await page.getByTestId('public-cancel-password-input').fill('wrong-password');
    await page.getByTestId('public-cancel-submit-button').click();
    await expect(page.getByRole('alert')).toContainText('취소 비밀번호가 일치하지 않습니다');

    await page.getByTestId('public-cancel-password-input').fill(cancelPassword);
    await page.getByTestId('public-cancel-submit-button').click();
    await expect(page.getByRole('status')).toContainText('예약 신청이 취소되었습니다');
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...originalSettings, version: latestSettings.version });
  }
});
