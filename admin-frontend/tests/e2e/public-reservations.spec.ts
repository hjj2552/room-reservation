import { expect, test } from './fixtures';
import { getSettingsByApi, nextWeekdayReservationLocalInputs, updateSettingsByApi } from './helpers';

function maskName(value: string) {
  const chars = Array.from(value);
  if (chars.length === 1) return '*';
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}*${chars[chars.length - 1]}`;
}

function maskEmail(value: string) {
  const [localPart, domain] = value.split('@');
  if (!domain) return maskName(value);
  if (localPart.length === 1) return `*@${domain}`;
  return `${localPart.slice(0, 2)}${'*'.repeat(Math.max(1, localPart.length - 2))}@${domain}`;
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 1) return '*';
  if (digits.length <= 5) return `${digits[0]}${'*'.repeat(Math.max(1, digits.length - 2))}${digits.at(-1)}`;
  return `${digits.slice(0, 4)}${'*'.repeat(digits.length - 5)}${digits.at(-1)}`;
}

test('public toolbar request opens the shared panel without slot room context', async ({ page, request, e2eData }) => {
  const originalSettings = await getSettingsByApi(request);
  await updateSettingsByApi(request, {
    ...originalSettings,
    reservationEnabled: true,
    reservationDisabledMessage: originalSettings.reservationDisabledMessage || 'Reservation is currently disabled.',
  });
  const room = await e2eData.createTestRoom('public-toolbar-request-room');

  try {
    await page.goto('/public/reservations/new');
    await page.getByTestId('public-timetable-view-room').click();
    await page.getByTestId('public-timetable-room-select').selectOption(room.id);
    await page.getByTestId('public-new-request-button').click();

    await expect(page.getByTestId('public-quick-request-panel')).toBeVisible();
    await expect(page.getByTestId('public-request-room-select')).toHaveValue('');
    await expect(page.getByTestId('public-request-start-input')).not.toHaveValue('');
    await expect(page.getByTestId('public-request-end-input')).not.toHaveValue('');
    await expect(page.getByTestId('public-request-applicant-name-input')).toHaveValue('');
    await expect(page.getByTestId('public-request-email-input')).toHaveValue('');
    await expect(page.getByTestId('public-request-phone-input')).toHaveAttribute('placeholder', '- 제외하고 입력');
    await expect(page.getByTestId('public-request-cancel-password-input')).toHaveAttribute('placeholder', '4자리 이상');
    await expect(page.getByTestId('public-request-purpose-input')).toHaveValue('');
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...originalSettings, version: latestSettings.version });
  }
});

test('public timetable supports slot-based request, masked detail page, and password cancellation', async ({ page, request, e2eData }) => {
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
  const phone = '010-3333-4444';
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
    await page.getByTestId('public-request-phone-input').fill(phone);
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
    const timetableBlock = page.locator('.reservation-block').filter({ hasText: purpose });
    await expect(timetableBlock).toContainText(maskName(applicantName));
    await expect(timetableBlock).not.toContainText(applicantName);
    await page.getByText(purpose).click();

    const detailPanel = page.locator('.reservation-detail-main');
    await expect(page).toHaveURL(new RegExp(`/public/reservations/${created.id}$`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: room.name })).toBeVisible();
    await expect(detailPanel.locator('dt')).toHaveCount(6);
    await expect(detailPanel.locator('.status-badge')).toContainText('승인 대기');
    await expect(detailPanel).toContainText('예약 정보');
    await expect(detailPanel).toContainText('신청 목적');
    await expect(detailPanel).toContainText('강의실');
    await expect(detailPanel).toContainText('날짜/시간');
    await expect(detailPanel).toContainText('신청자 이름');
    await expect(detailPanel).toContainText('이메일');
    await expect(detailPanel).toContainText('전화번호');
    await expect(detailPanel).toContainText(purpose);
    await expect(detailPanel).toContainText(maskName(applicantName));
    await expect(detailPanel).toContainText(maskEmail(email));
    await expect(detailPanel).toContainText(maskPhone(phone));
    await expect(detailPanel).not.toContainText(applicantName);
    await expect(detailPanel).not.toContainText(email);
    await expect(detailPanel).not.toContainText(phone);
    await expect(detailPanel).not.toContainText('신청 경로');
    await expect(detailPanel).not.toContainText('반복 예약');
    await expect(detailPanel).not.toContainText('예약 요약');
    await expect(page.getByRole('heading', { name: '감사 이력' })).toHaveCount(0);

    await page.getByRole('button', { name: '예약 신청 취소' }).click();
    await page.getByTestId('public-cancel-password-input').fill('wrong-password');
    await page.getByTestId('public-cancel-submit-button').click();
    await expect(page.getByRole('alert')).toContainText('취소 비밀번호가 일치하지 않습니다');

    await page.getByTestId('public-cancel-password-input').fill(cancelPassword);
    await page.getByTestId('public-cancel-submit-button').click();
    await expect(page.getByRole('status')).toContainText('예약 신청을 취소했습니다');

    await page.goto('/public/reservations/new');
    await page.getByTestId('public-timetable-view-room').click();
    await page.getByTestId('public-timetable-room-select').selectOption(room.id);
    await page.getByTestId('public-timetable-week-input').fill(reservationTime.date);
    await expect(page.getByText(purpose)).toHaveCount(0);
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...originalSettings, version: latestSettings.version });
  }
});
