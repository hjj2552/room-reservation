import { expect, test } from './fixtures';
import {
  cancelReservationByApi,
  deleteRoomByApi,
  loginByApi,
  moveFocusOutsidePanel,
  nextWeekdayReservationLocalInputs,
} from './helpers';
import { serviceDateInputValue } from '../../shared/utils/reservationTime';

test('admin timetable menu restores date context and excludes transient query state', async ({
  page,
  request,
  e2eData,
}) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('timetable-context-date');

  await page.goto('/admin/reservations');
  await page.getByRole('link', { name: '시간표', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/admin/timetable' && url.search === '');
  await expect(page.getByTestId('timetable-date-input')).toHaveValue(serviceDateInputValue());

  await page.goto(
    `/admin/timetable?view=date&date=2026-09-15&roomId=${room.id}`
      + '&duplicateReservationId=11111111-1111-4111-8111-111111111111&unknown=ignored',
  );
  await expect(page.getByTestId('timetable-date-input')).toHaveValue('2026-09-15');
  await expect(page.getByTestId('timetable-date-room-select')).toHaveValue(room.id);

  await page.getByRole('link', { name: '예약 목록', exact: true }).click();
  const timetableLink = page.getByRole('link', { name: '시간표', exact: true });
  await timetableLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL((url) => (
    url.pathname === '/admin/timetable'
    && url.searchParams.get('view') === 'date'
    && url.searchParams.get('date') === '2026-09-15'
    && url.searchParams.get('roomId') === room.id
    && !url.searchParams.has('duplicateReservationId')
    && !url.searchParams.has('unknown')
  ));
  await expect(timetableLink).toHaveAttribute('aria-current', 'page');

  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/admin/reservations');

  await page.goto('/admin/timetable?view=date&date=2026-10-02');
  await page.getByRole('link', { name: '공간 관리', exact: true }).click();
  await page.getByRole('link', { name: '시간표', exact: true }).click();
  await expect(page).toHaveURL((url) => (
    url.pathname === '/admin/timetable'
    && url.searchParams.get('view') === 'date'
    && url.searchParams.get('date') === '2026-10-02'
    && !url.searchParams.has('roomId')
  ));
});

test('admin timetable menu restores room view week and room context', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('timetable-context-room');

  await page.goto(
    `/admin/timetable?view=room&weekStart=2026-09-14&roomViewRoomId=${room.id}`,
  );
  await expect(page.getByTestId('timetable-week-input')).toHaveValue('2026-09-14');
  await expect(page.getByTestId('timetable-room-select')).toHaveValue(room.id);

  await page.getByRole('link', { name: '반복 예약', exact: true }).click();
  await page.getByRole('link', { name: '시간표', exact: true }).click();
  await expect(page).toHaveURL((url) => (
    url.pathname === '/admin/timetable'
    && url.searchParams.get('view') === 'room'
    && url.searchParams.get('weekStart') === '2026-09-14'
    && url.searchParams.get('roomViewRoomId') === room.id
  ));
  await expect(page.getByTestId('timetable-week-input')).toHaveValue('2026-09-14');
  await expect(page.getByTestId('timetable-room-select')).toHaveValue(room.id);
});

test('admin timetable menu replaces unavailable room context with active rooms', async ({
  page,
  request,
  e2eData,
}) => {
  await loginByApi(request);
  const fallbackRoom = await e2eData.createTestRoom('timetable-context-fallback');
  const unavailableRoom = await e2eData.createTestRoom('timetable-context-unavailable');
  const date = '2026-09-15';
  const weekStart = '2026-09-14';

  await page.goto(
    `/admin/timetable?view=date&date=${date}&weekStart=${weekStart}`
      + `&roomId=${unavailableRoom.id}&roomViewRoomId=${unavailableRoom.id}`,
  );
  await expect(page.getByTestId('timetable-date-room-select')).toHaveValue(unavailableRoom.id);

  await page.locator('a[href="/admin/reservations"]').click();
  await e2eData.setTestRoomEnabled(unavailableRoom.id, false);
  await page.reload();
  await page.locator('a[href^="/admin/timetable"]').click();

  await expect(page).toHaveURL((url) => (
    url.pathname === '/admin/timetable'
    && url.searchParams.get('view') === 'date'
    && url.searchParams.get('date') === date
    && url.searchParams.get('weekStart') === weekStart
    && !url.searchParams.has('roomId')
    && Boolean(url.searchParams.get('roomViewRoomId'))
    && url.searchParams.get('roomViewRoomId') !== unavailableRoom.id
    && !url.search.includes(unavailableRoom.id)
  ));
  await expect(page.getByTestId('timetable-date-room-select')).toHaveValue('');
  const recoveredRoomId = new URL(page.url()).searchParams.get('roomViewRoomId') || '';

  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/admin/reservations');
  await page.locator('a[href^="/admin/timetable"]').click();
  await page.getByTestId('timetable-view-room').click();
  const roomSelect = page.getByTestId('timetable-room-select');
  await expect(roomSelect).toHaveValue(recoveredRoomId);
  expect(await roomSelect.locator('option').first().getAttribute('value')).toBe(recoveredRoomId);
  await expect(roomSelect.locator(`option[value="${fallbackRoom.id}"]`)).toHaveCount(1);

  await page.locator('a[href="/admin/reservations"]').click();
  await page.locator('a[href^="/admin/timetable"]').click();
  await expect(page).toHaveURL((url) => (
    url.pathname === '/admin/timetable'
    && url.searchParams.get('view') === 'room'
    && url.searchParams.get('date') === date
    && url.searchParams.get('weekStart') === weekStart
    && !url.searchParams.has('roomId')
    && url.searchParams.get('roomViewRoomId') === recoveredRoomId
    && !url.search.includes(unavailableRoom.id)
  ));
  await expect(page.getByTestId('timetable-room-select')).toHaveValue(recoveredRoomId);
});

test('admin timetable menu falls back safely when session storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value: () => { throw new DOMException('Storage is blocked'); },
      });
    }
  });

  await page.goto('/admin/timetable?view=date&date=2026-09-15');
  await expect(page.getByTestId('timetable-date-input')).toHaveValue('2026-09-15');
  await page.getByRole('link', { name: '예약 목록', exact: true }).click();
  await page.getByRole('link', { name: '시간표', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/admin/timetable' && url.search === '');
});

test('admin timetable rejects invalid direct and stored context values', async ({ page }) => {
  await page.goto(
    '/admin/timetable?view=calendar&date=2026-02-29&weekStart=2026-99-99'
      + '&roomId=not-a-uuid&roomViewRoomId=also-not-a-uuid',
  );
  await expect(page).toHaveURL((url) => url.pathname === '/admin/timetable' && url.search === '');
  await expect(page.getByTestId('timetable-date-input')).toHaveValue(serviceDateInputValue());

  await page.getByRole('link', { name: '예약 목록', exact: true }).click();
  await page.evaluate(() => {
    window.sessionStorage.setItem(
      'admin-timetable-context',
      'view=calendar&weekStart=2026-99-99&roomViewRoomId=not-a-uuid',
    );
  });
  await page.reload();
  await page.getByRole('link', { name: '시간표', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/admin/timetable' && url.search === '');
  await expect(page.getByTestId('timetable-date-input')).toHaveValue(serviceDateInputValue());
});

test('date view reads URL context and opens the reservation detail page', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('date-timetable-room');
  const reservationDay = nextWeekdayReservationLocalInputs({ daysAhead: 21, startHour: 10, endHour: 11 }).date;
  const reservation = await e2eData.createTestReservation(room.id, 'date-timetable', {
    startAt: `${reservationDay}T10:00:00+09:00`,
    endAt: `${reservationDay}T11:00:00+09:00`,
    memo: 'testing-date-timetable-seed',
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

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`date=${reservationDay}`));
    await expect(page).toHaveURL(new RegExp(`roomId=${room.id}`));
    await expect(page.getByTestId('timetable-date-input')).toHaveValue(reservationDay);
    await expect(page.getByTestId('timetable-date-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('reservation-date-timetable')).toContainText(purpose);
  } finally {
    await cancelReservationByApi(request, reservation.id, 'testing-cleanup');
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
    memo: 'testing-room-timetable-seed',
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
    await cancelReservationByApi(request, reservation.id, 'testing-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('admin timetable exposes the shared room information dialog in both views', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const description = [
    '프로젝터와 HDMI 케이블을 사용할 수 있습니다.',
    '음식물 반입은 허용되지 않습니다.',
  ].join('\n');
  const informedRoom = await e2eData.createTestRoom('admin-room-info', {
    location: '본관 3층',
    capacity: 0,
    description,
  });
  const blankRoom = await e2eData.createTestRoom('admin-room-info-blank', {
    description: '   ',
  });

  try {
    await page.goto('/admin/timetable?view=date&date=2026-09-10');
    const informedHeader = page.locator('.timetable-room-header').filter({ hasText: informedRoom.name });
    const infoTrigger = informedHeader.getByRole('button', { name: `${informedRoom.name} 공간 정보 보기` });
    const blankHeader = page.locator('.timetable-room-header').filter({ hasText: blankRoom.name });

    await expect(infoTrigger).toBeVisible();
    await expect(blankHeader.getByRole('button')).toHaveCount(0);
    await infoTrigger.click();

    const dialog = page.getByRole('dialog', { name: '공간 정보' });
    const closeButton = page.getByRole('button', { name: '공간 정보 닫기' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(informedRoom.name);
    await expect(dialog).toContainText('본관 3층');
    await expect(dialog).toContainText('수용 인원 0명');
    await expect(dialog.locator('.room-info-description')).toContainText('음식물 반입은 허용되지 않습니다.');
    await expect(closeButton).toBeFocused();
    await closeButton.click();
    await expect(dialog).toBeHidden();
    await expect(infoTrigger).toBeFocused();

    await infoTrigger.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(infoTrigger).toBeFocused();

    await infoTrigger.click();
    await page.getByTestId('room-info-backdrop').click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeHidden();

    await page.getByTestId('timetable-view-room').click();
    await page.getByTestId('timetable-room-select').selectOption(informedRoom.id);
    const moreButton = page.getByTestId('room-info-more-button');
    await expect(moreButton).toBeVisible();
    await moreButton.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('수용 인원 0명');
    await closeButton.click();
    await expect(dialog).toBeHidden();
    await expect(moreButton).toBeFocused();

    await page.getByTestId('timetable-room-select').selectOption(blankRoom.id);
    await expect(page.getByTestId('room-info-more-button')).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('timetable-room-select').selectOption(informedRoom.id);
    await page.getByTestId('room-info-more-button').click();
    await expect(dialog).toContainText('프로젝터와 HDMI 케이블을 사용할 수 있습니다.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await deleteRoomByApi(request, informedRoom.id);
    await deleteRoomByApi(request, blankRoom.id);
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
    await expect(page.getByTestId('quick-add-start-input-date')).toHaveValue(reservationDay);
    await expect(page.getByTestId('quick-add-start-input')).toHaveValue('12:00');
    await expect(page.getByTestId('quick-add-end-input')).toHaveValue('12:30');
    const phoneInput = page.getByTestId('quick-add-phone-input');
    await expect(phoneInput).toHaveAttribute('type', 'tel');
    await expect(phoneInput).toHaveAttribute('inputmode', 'tel');
    await phoneInput.fill('010+12345678');
    await page.getByTestId('quick-add-save-button').click();
    await expect(phoneInput.locator('..')).toContainText('전화번호는 숫자, 하이픈(-), 공백만 입력해 주세요.');
    await phoneInput.fill('');

    const applicantName = 'testing-admin-visible';
    await page.getByTestId('quick-add-applicant-name-input').fill(applicantName);
    await page.getByTestId('quick-add-purpose-input').fill(purpose);
    await page.getByTestId('quick-add-show-applicant-name-input').check();

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/reservations') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('quick-add-save-button').click();
    const createResponse = await createResponsePromise;
    const createResponseBody = await createResponse.text();
    const createRequestBody = JSON.parse(createResponse.request().postData() || '{}') as {
      roomId?: string;
      applicantEmail?: string | null;
      applicantPhone?: string | null;
      showApplicantName?: boolean;
    };
    expect(createRequestBody.roomId).toBe(room.id);
    expect(createRequestBody.applicantEmail).toBeNull();
    expect(createRequestBody.applicantPhone).toBeNull();
    expect(createRequestBody.showApplicantName).toBe(true);
    expect(createResponse.ok(), createResponseBody).toBeTruthy();
    createdReservationId = (JSON.parse(createResponseBody) as { id: string }).id;
    e2eData.registerReservation(createdReservationId);

    await expect(page.getByTestId('timetable-quick-add-panel')).toBeHidden();
    await expect(page.getByTestId('reservation-date-timetable')).toContainText(purpose);

    await page.goto(`/timetable?view=date&date=${reservationDay}&roomId=${room.id}`);
    await expect(page.getByText(applicantName)).toBeVisible();
  } finally {
    if (createdReservationId) {
      await cancelReservationByApi(request, createdReservationId, 'testing-cleanup');
    }
    await deleteRoomByApi(request, room.id);
  }
});

test('toolbar request opens the shared panel without slot room context', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('toolbar-request-room');

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/timetable');
    await page.getByTestId('timetable-date-room-select').selectOption(room.id);
    const newRequestButton = page.getByTestId('timetable-new-request-button');
    await newRequestButton.click();

    await expect(page.getByTestId('timetable-quick-add-panel')).toBeVisible();
    await expect(page.getByTestId('timetable-quick-add-panel-backdrop')).toBeVisible();
    const closeButton = page.getByTestId('timetable-quick-add-close');
    const closeButtonBox = await closeButton.boundingBox();
    expect(closeButtonBox?.width).toBe(44);
    const panelBody = page.locator('.reservation-request-panel .side-panel-body');
    await expect(panelBody).toHaveCSS('overflow-y', 'auto');
    await expect(panelBody).toHaveCSS('overscroll-behavior-x', 'none');
    await expect(panelBody).toHaveCSS('overscroll-behavior-y', 'contain');
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await expect(page.locator('body')).toHaveCSS('position', 'fixed');
    const panelScroll = await panelBody.evaluate((element) => {
      const before = element.scrollTop;
      element.scrollTop = element.scrollHeight;
      return {
        before,
        after: element.scrollTop,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    });
    expect(panelScroll.scrollHeight).toBeGreaterThan(panelScroll.clientHeight);
    expect(panelScroll.after).toBeGreaterThan(panelScroll.before);
    await expect(page.getByTestId('quick-add-room-select')).toHaveValue('');
    await expect(page.getByTestId('quick-add-start-input')).not.toHaveValue('');
    await expect(page.getByTestId('quick-add-end-input')).not.toHaveValue('');
    await expect(page.getByTestId('quick-add-applicant-name-input')).toHaveValue('');
    await expect(page.getByTestId('quick-add-email-input')).toHaveValue('');
    const draftPurpose = e2eData.name('admin-backdrop-draft');
    await page.getByTestId('quick-add-purpose-input').fill(draftPurpose);
    await page.getByTestId('timetable-quick-add-panel-backdrop').click({ position: { x: 4, y: 4 } });
    await expect(page.getByTestId('timetable-quick-add-panel')).toBeVisible();
    await expect(page.getByTestId('quick-add-purpose-input')).toHaveValue(draftPurpose);
    await moveFocusOutsidePanel(page, 'timetable-quick-add-panel');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('timetable-quick-add-panel')).toBeHidden();
    await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
    await expect(newRequestButton).toBeFocused();

    await newRequestButton.click();
    await page.getByTestId('quick-add-purpose-input').focus();
    await expect(page.getByTestId('quick-add-purpose-input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('timetable-quick-add-panel')).toBeHidden();
    await expect(newRequestButton).toBeFocused();
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
    await expect(page.getByTestId('quick-add-start-input-date')).toHaveValue(reservationDay);
    await expect(page.getByTestId('quick-add-start-input')).toHaveValue('12:00');
    await expect(page.getByTestId('quick-add-end-input')).toHaveValue('12:30');

    await page.getByTestId('quick-add-applicant-name-input').fill('testing-admin');
    await page.getByTestId('quick-add-email-input').fill(`testing-quick-add-select-room-${Date.now()}@example.test`);
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
      await cancelReservationByApi(request, createdReservationId, 'testing-cleanup');
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
    await expect(page.getByTestId('quick-add-start-input-date')).toHaveValue(weekStart);
    await expect(page.getByTestId('quick-add-start-input')).toHaveValue('09:00');
    await expect(page.getByTestId('quick-add-end-input')).toHaveValue('09:30');

    await page.getByTestId('quick-add-applicant-name-input').fill('testing-admin');
    await page.getByTestId('quick-add-email-input').fill(`testing-quick-add-room-${Date.now()}@example.test`);
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
      await cancelReservationByApi(request, createdReservationId, 'testing-cleanup');
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
