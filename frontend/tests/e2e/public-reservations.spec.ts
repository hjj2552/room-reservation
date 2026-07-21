import { expect, test } from './fixtures';
import {
  approveReservationByApi,
  expectTestIdPairsOnSameRow,
  expectTestIdsInDomOrder,
  getSettingsByApi,
  nextWeekdayReservationLocalInputs,
  updateSettingsByApi,
} from './helpers';

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

test('legacy public routes fall through to the current root fallback', async ({ page }) => {
  const legacyPaths = [
    '/reserve',
    '/public',
    '/cancel',
    '/cancel/legacy-reservation',
    '/public/reservations/legacy-reservation',
    '/public/reservations/legacy-reservation/edit',
  ];

  for (const path of legacyPaths) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
  }
});

test('public timetable exposes room descriptions without changing timetable context', async ({ page, e2eData }) => {
  const description = [
    '프로젝터와 HDMI 케이블을 사용할 수 있습니다.',
    '음식물 반입은 허용되지 않습니다.',
    '퇴실 전 냉난방기 전원을 확인해 주세요.',
  ].join('\n');
  const informedRoom = await e2eData.createTestRoom('public-room-info', {
    location: '본관 2층',
    description,
  });
  const blankRoom = await e2eData.createTestRoom('public-room-info-blank', {
    description: '   ',
  });

  await page.goto('/timetable?view=date&date=2026-09-10');
  const timetableScroll = page.getByRole('region', { name: '2026-09-10 날짜별 예약 시간표' });
  const informedHeader = page.locator('.timetable-room-header').filter({ hasText: informedRoom.name });
  const infoTrigger = informedHeader.getByRole('button', { name: `${informedRoom.name} 공간 이용 안내 보기` });
  const blankHeader = page.locator('.timetable-room-header').filter({ hasText: blankRoom.name });

  await expect(infoTrigger).toBeVisible();
  await expect(blankHeader.getByRole('button')).toHaveCount(0);
  await infoTrigger.scrollIntoViewIfNeeded();
  await timetableScroll.evaluate((element) => {
    element.scrollTop = 120;
  });
  const urlBeforeModal = page.url();
  const scrollBeforeModal = await timetableScroll.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
  }));

  await infoTrigger.click();
  const dialog = page.getByRole('dialog', { name: '공간 이용 안내' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(informedRoom.name);
  await expect(dialog).toContainText('본관 2층');
  await expect(dialog.locator('.room-info-description')).toHaveCSS('white-space', 'pre-wrap');
  await expect(dialog.locator('.room-info-description')).toContainText('음식물 반입은 허용되지 않습니다.');
  await expect(dialog.getByRole('button', { name: '접기' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '공간 이용 안내 닫기' })).toBeFocused();
  await page.getByRole('button', { name: '공간 이용 안내 닫기' }).click();
  await expect(dialog).toBeHidden();
  await expect(infoTrigger).toBeFocused();
  expect(page.url()).toBe(urlBeforeModal);
  expect(await timetableScroll.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop })))
    .toEqual(scrollBeforeModal);

  await infoTrigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(infoTrigger).toBeFocused();

  await infoTrigger.click();
  await page.getByTestId('room-info-backdrop').click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeHidden();

  await page.getByTestId('public-timetable-view-room').click();
  await page.getByTestId('public-timetable-room-select').selectOption(informedRoom.id);
  const roomTimetable = page.getByTestId('reservation-room-timetable');
  await expect(roomTimetable.locator('.timetable-room-summary-title')).toContainText(informedRoom.name);
  const moreButton = page.getByTestId('room-info-more-button');
  await expect(moreButton).toBeVisible();
  await moreButton.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('본관 2층');
  await page.getByRole('button', { name: '공간 이용 안내 닫기' }).click();
  await expect(dialog).toBeHidden();
  await expect(moreButton).toBeFocused();

  await page.getByTestId('public-timetable-room-select').selectOption(blankRoom.id);
  await expect(page.getByTestId('room-info-more-button')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('public-timetable-room-select').selectOption(informedRoom.id);
  await expect(page.getByTestId('room-info-more-button')).toBeVisible();
  await page.getByTestId('room-info-more-button').click();
  await expect(dialog).toContainText('퇴실 전 냉난방기 전원을 확인해 주세요.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('public toolbar request opens the shared panel without slot room context', async ({ page, request, e2eData }) => {
  const originalSettings = await getSettingsByApi(request);
  await updateSettingsByApi(request, {
    ...originalSettings,
    reservationEnabled: true,
    reservationDisabledMessage: originalSettings.reservationDisabledMessage || 'Reservation is currently disabled.',
  });
  const room = await e2eData.createTestRoom('public-toolbar-request-room');

  try {
    await page.goto('/timetable');
    await page.getByTestId('public-timetable-view-room').click();
    await page.getByTestId('public-timetable-room-select').selectOption(room.id);
    await page.getByTestId('public-new-request-button').click();

    await expect(page.getByTestId('public-quick-request-panel')).toBeVisible();
    await expectTestIdsInDomOrder(page, [
      'public-request-purpose-input',
      'public-request-room-select',
      'public-request-start-input-date',
      'public-request-start-input',
      'public-request-end-input',
      'public-request-applicant-name-input',
      'public-request-email-input',
      'public-request-phone-input',
      'public-request-status-select',
      'public-request-cancel-password-input',
    ]);
    await expectTestIdPairsOnSameRow(page, [
      ['public-request-room-select', 'public-request-start-input-date'],
      ['public-request-start-input', 'public-request-end-input'],
      ['public-request-applicant-name-input', 'public-request-email-input'],
      ['public-request-phone-input', 'public-request-status-select'],
    ]);
    await expect(page.getByTestId('public-request-purpose-input').locator('..')).toContainText('신청 목적');
    await expect(page.getByTestId('public-request-room-select').locator('..')).toContainText('예약 공간');
    await expect(page.getByTestId('public-request-applicant-name-input').locator('..')).toContainText('신청자');
    await expect(page.getByTestId('public-request-status-select')).not.toBeEditable();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByTestId('public-request-room-select')).toHaveValue('');
    await expect(page.getByTestId('public-request-start-input')).not.toHaveValue('');
    await expect(page.getByTestId('public-request-end-input')).not.toHaveValue('');
    await expect(page.getByTestId('public-request-applicant-name-input')).toHaveValue('');
    await expect(page.getByTestId('public-request-email-input')).toHaveValue('');
    await expect(page.getByTestId('public-request-phone-input')).toHaveAttribute('placeholder', '- 제외하고 입력');
    await expect(page.getByTestId('public-request-cancel-password-input')).toHaveAttribute(
      'placeholder',
      '영문·숫자·특수문자 4~64자',
    );
    const passwordInput = page.getByTestId('public-request-cancel-password-input');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(passwordInput).toHaveAttribute('minlength', '4');
    await expect(passwordInput).toHaveAttribute('maxlength', '64');
    await expect(passwordInput.locator('..')).toContainText('예약 비밀번호는 영문, 숫자, 특수문자를 사용해 4~64자로 입력해 주세요.');
    await passwordInput.fill('Aa1!');
    await expect(passwordInput).toHaveValue('Aa1!');
    await passwordInput.fill('한글');
    await expect(passwordInput).toHaveValue('Aa1!');
    await expect(passwordInput.locator('..')).toContainText('한글과 공백은 사용할 수 없습니다.');
    await passwordInput.fill(`A${'b'.repeat(61)}1!`);
    await expect(passwordInput).toHaveValue(`A${'b'.repeat(61)}1!`);
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

  await page.goto('/timetable');
  await page.getByTestId('public-timetable-date-input').fill(reservationTime.date);
  await expect(page).toHaveURL(new RegExp(`date=${reservationTime.date}`));
  await expect(page.getByText(reservation.purpose || '')).toBeVisible();

  await page.getByText(reservation.purpose || '').click();
  await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}$`));

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/timetable\\?.*date=${reservationTime.date}`));
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
  const selectedWeekStart = mondayOf(reservationTime.date);
  const applicantName = e2eData.name('public-applicant');
  const purpose = e2eData.name('public-purpose');
  const email = `${e2eData.name('public-email')}@example.test`;
  const phone = '010-3333-4444';
  const cancelPassword = 'testing-public-password';

  try {
    await page.goto('/timetable');
    await page.getByTestId('public-timetable-view-room').click();
    await page.getByTestId('public-timetable-room-select').selectOption(room.id);
    await page.getByTestId('public-timetable-week-input').fill(reservationTime.date);

    await page.getByTestId('timetable-empty-slot').first().click();
    await expect(page.getByTestId('public-quick-request-panel')).toBeVisible();
    await expect(page.getByTestId('public-request-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('public-request-start-input-date')).toHaveValue(selectedWeekStart);
    await expect(page.getByTestId('public-request-start-input')).toHaveValue('09:00');
    await expect(page.getByTestId('public-request-end-input')).toHaveValue('09:30');

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
    await expect(detailPanel).toContainText('공간');
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
    await expect(page.getByRole('button', { name: '이전으로', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '시간표로 돌아가기', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('public-detail-action-buttons').getByRole('button')).toHaveText(['취소', '수정']);

    const cancelButton = page.getByRole('button', { name: '취소', exact: true });
    await cancelButton.click();
    const passwordDialog = page.getByRole('dialog', { name: '예약 비밀번호 확인' });
    await expect(passwordDialog).toBeVisible();
    await expect(passwordDialog.locator('.modal-close-button')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(passwordDialog).toBeHidden();
    await expect(cancelButton).toBeFocused();

    await cancelButton.click();
    await expect(passwordDialog).toBeVisible();
    await page.getByTestId('public-cancel-password-input').fill('wrong-password');
    await page.getByTestId('public-cancel-submit-button').click();
    await expect(page.getByRole('alert')).toContainText('예약 비밀번호가 일치하지 않습니다');

    await page.getByTestId('public-cancel-password-input').fill(cancelPassword);
    await page.getByTestId('public-cancel-submit-button').click();
    await expect(page.getByRole('dialog', { name: '취소할까요?' })).toBeVisible();
    await expect(page.getByTestId('public-cancel-confirm-button')).toHaveText('취소');
    await page.getByTestId('public-cancel-confirm-button').click();
    await expect(page.getByRole('status')).toContainText('예약을 취소했습니다');

    await page.goto('/timetable');
    await page.getByTestId('public-timetable-view-room').click();
    await page.getByTestId('public-timetable-room-select').selectOption(room.id);
    await page.getByTestId('public-timetable-week-input').fill(reservationTime.date);
    await expect(page.getByText(purpose)).toHaveCount(0);
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...originalSettings, version: latestSettings.version });
  }
});

function mondayOf(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

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
    cancelPassword: 'testing-public-edit-password',
  });
  await approveReservationByApi(request, reservation.id, 'testing-approve-public-edit');
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
    await expect(page.getByRole('button', { name: '이전으로', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '상세로', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '취소', exact: true })).toBeVisible();
    await expectTestIdsInDomOrder(page, [
      'public-edit-purpose-input',
      'public-edit-room-select',
      'public-edit-date-input',
      'public-edit-start-input',
      'public-edit-end-input',
      'public-edit-applicant-name-input',
      'public-edit-email-input',
      'public-edit-phone-input',
      'public-edit-status-input',
    ]);
    await expectTestIdPairsOnSameRow(page, [
      ['public-edit-room-select', 'public-edit-date-input'],
      ['public-edit-start-input', 'public-edit-end-input'],
      ['public-edit-applicant-name-input', 'public-edit-email-input'],
      ['public-edit-phone-input', 'public-edit-status-input'],
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
    await expect(page.getByTestId('public-edit-status-input')).not.toBeEditable();
    await expect(page.getByTestId('public-edit-save-button').locator('svg')).toHaveCount(0);
    await expect(page.getByTestId('public-edit-save-button')).toHaveText('수정 저장');
    await expect(page.getByTestId('public-edit-start-input').locator('option[value="09:05"]')).toHaveCount(1);
    await expect(page.getByTestId('public-edit-purpose-input')).toHaveValue(reservation.purpose || '');
    await expect(page.getByTestId('public-edit-email-input')).toHaveValue(reservation.applicantEmail);

    await page.getByTestId('public-edit-purpose-input').fill(editedPurpose);
    await page.getByTestId('public-edit-applicant-name-input').fill(editedName);
    await page.getByTestId('public-edit-email-input').fill(editedEmail);
    await page.getByTestId('public-edit-phone-input').fill(editedPhone);
    await page.getByTestId('public-edit-date-input').fill(editTime.date);
    await page.getByTestId('public-edit-start-input').selectOption(editTime.startAt.slice(11, 16));
    await page.getByTestId('public-edit-end-input').selectOption(editTime.endAt.slice(11, 16));
    await page.getByTestId('public-edit-save-button').click();

    await expect(page.getByRole('status')).toContainText('다시 승인 대기로 변경되었습니다');
    await page.getByRole('button', { name: '취소', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}$`));
    await expect(page.locator('.status-badge')).toContainText('승인 대기');
    await expect(page.locator('.reservation-detail-main')).toContainText(editedPurpose);
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...originalSettings, version: latestSettings.version });
  }
});
