import { expect, test } from './fixtures';
import { approveReservationByApi, getSettingsByApi, nextWeekdayReservationLocalInputs, updateSettingsByApi } from './helpers';

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
    await page.goto('/reserve');
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
    await expect(page.getByTestId('public-request-cancel-password-input')).toHaveAttribute(
      'placeholder',
      '4자리 이상, 수정 및 취소 시 사용',
    );
    await expect(page.getByTestId('public-request-purpose-input')).toHaveValue('');
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...originalSettings, version: latestSettings.version });
  }
});

test('public date timetable preserves its URL context after browser back from detail', async ({ page, e2eData }) => {
  const room = await e2eData.createTestRoom('public-history-room');
  const reservationTime = nextWeekdayReservationLocalInputs({ daysAhead: 42, startHour: 14, endHour: 15 });
  const reservation = await e2eData.createTestPublicReservation(room.id, 'public-history-reservation', {
    startAt: `${reservationTime.startAt}:00+09:00`,
    endAt: `${reservationTime.endAt}:00+09:00`,
  });

  await page.goto('/reserve');
  await page.getByTestId('public-timetable-date-input').fill(reservationTime.date);
  await expect(page).toHaveURL(new RegExp(`date=${reservationTime.date}`));
  await expect(page.getByText(reservation.purpose || '')).toBeVisible();

  await page.getByText(reservation.purpose || '').click();
  await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}$`));

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/reserve\\?.*date=${reservationTime.date}`));
  await expect(page.getByTestId('public-timetable-date-input')).toHaveValue(reservationTime.date);
  await expect(page.getByText(reservation.purpose || '')).toBeVisible();
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
    await page.goto('/reserve');
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
    await expect(page).toHaveURL(new RegExp(`/reservations/${created.id}$`));
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
    await expect(page.getByRole('dialog', { name: '예약 비밀번호 확인' })).toBeVisible();
    await page.getByTestId('public-cancel-password-input').fill('wrong-password');
    await page.getByTestId('public-cancel-submit-button').click();
    await expect(page.getByRole('alert')).toContainText('예약 비밀번호가 일치하지 않습니다');

    await page.getByTestId('public-cancel-password-input').fill(cancelPassword);
    await page.getByTestId('public-cancel-submit-button').click();
    await expect(page.getByRole('dialog', { name: '예약 신청을 취소할까요?' })).toBeVisible();
    await page.getByTestId('public-cancel-confirm-button').click();
    await expect(page.getByRole('status')).toContainText('예약 신청을 취소했습니다');

    await page.goto('/reserve');
    await page.getByTestId('public-timetable-view-room').click();
    await page.getByTestId('public-timetable-room-select').selectOption(room.id);
    await page.getByTestId('public-timetable-week-input').fill(reservationTime.date);
    await expect(page.getByText(purpose)).toHaveCount(0);
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...originalSettings, version: latestSettings.version });
  }
});

test('public can edit a CONFIRMED status reservation and it returns to REQUESTED status', async ({ page, request, e2eData }) => {
  const originalSettings = await getSettingsByApi(request);
  await updateSettingsByApi(request, {
    ...originalSettings,
    reservationEnabled: true,
    reservationDisabledMessage: originalSettings.reservationDisabledMessage || 'Reservation is currently disabled.',
  });
  const room = await e2eData.createTestRoom('public-edit-room');
  const createTime = nextWeekdayReservationLocalInputs({ daysAhead: 28, startHour: 10, endHour: 11 });
  const editTime = nextWeekdayReservationLocalInputs({ daysAhead: 28, startHour: 12, endHour: 13 });
  const reservation = await e2eData.createTestPublicReservation(room.id, 'public-edit-approved', {
    startAt: `${createTime.startAt}:00+09:00`,
    endAt: `${createTime.endAt}:00+09:00`,
    cancelPassword: 'e2e-public-edit-password',
  });
  await approveReservationByApi(request, reservation.id, 'e2e-approve-public-edit');
  const editedPurpose = e2eData.name('reservation-public-edit-updated');
  const editedName = e2eData.name('public-edit-applicant-updated');
  const editedEmail = `${e2eData.name('public-edit-email-updated')}@example.test`;
  const editedPhone = '010-5555-6666';

  try {
    await page.goto(`/reservations/${reservation.id}`);
    await expect(page.locator('.status-badge')).toContainText('승인');
    await page.getByTestId('public-reservation-edit-link').click();
    await expect(page.getByRole('dialog', { name: '예약 비밀번호 확인' })).toBeVisible();
    await page.getByTestId('public-edit-password-input').fill('wrong-password');
    await page.getByTestId('public-edit-verify-button').click();
    await expect(page.getByRole('alert')).toContainText('예약 비밀번호가 일치하지 않습니다');
    await page.getByTestId('public-edit-password-input').fill(reservation.cancelPassword);
    await page.getByTestId('public-edit-verify-button').click();
    await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}/edit$`));
    await expect(page.getByTestId('public-edit-purpose-input')).toHaveValue(reservation.purpose || '');
    await expect(page.getByTestId('public-edit-email-input')).toHaveValue(reservation.applicantEmail);

    await page.getByTestId('public-edit-purpose-input').fill(editedPurpose);
    await page.getByTestId('public-edit-applicant-name-input').fill(editedName);
    await page.getByTestId('public-edit-email-input').fill(editedEmail);
    await page.getByTestId('public-edit-phone-input').fill(editedPhone);
    await page.getByTestId('public-edit-start-input').fill(editTime.startAt);
    await page.getByTestId('public-edit-end-input').fill(editTime.endAt);
    await page.getByTestId('public-edit-save-button').click();

    await expect(page.getByRole('status')).toContainText('다시 승인 대기로 변경되었습니다');
    await page.goto(`/reservations/${reservation.id}`);
    await expect(page.locator('.status-badge')).toContainText('승인 대기');
    await expect(page.locator('.reservation-detail-main')).toContainText(editedPurpose);
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...originalSettings, version: latestSettings.version });
  }
});
