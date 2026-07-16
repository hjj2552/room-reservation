import { expect, test } from './fixtures';
import type { Locator } from '@playwright/test';
import {
  cancelReservationByApi,
  deleteRoomByApi,
  expectTestIdPairsOnSameRow,
  expectTestIdsInDomOrder,
  getSettingsByApi,
  loginByApi,
  nextWeekdayReservationLocalInputs,
} from './helpers';
import { newRequestSelection } from '../../shared/utils/reservationTime';

async function expectFormControlsContained(container: Locator) {
  const metrics = await container.evaluate((element) => {
    const containerRect = element.getBoundingClientRect();

    return Array.from(element.querySelectorAll<HTMLElement>('input:not([type="checkbox"]), select, textarea')).map((control) => {
      const controlRect = control.getBoundingClientRect();
      const style = getComputedStyle(control);

      return {
        type: control instanceof HTMLInputElement ? control.type : control.tagName.toLowerCase(),
        controlLeft: controlRect.left,
        controlRight: controlRect.right,
        containerLeft: containerRect.left,
        containerRight: containerRect.right,
        controlHeight: controlRect.height,
        appearance: style.appearance,
        lineHeight: style.lineHeight,
        maxHeight: style.maxHeight,
        minInlineSize: style.minInlineSize,
        maxInlineSize: style.maxInlineSize,
        paddingBlockStart: style.paddingBlockStart,
        paddingBlockEnd: style.paddingBlockEnd,
        paddingInlineStart: style.paddingInlineStart,
        paddingInlineEnd: style.paddingInlineEnd,
        textAlign: style.textAlign,
      };
    });
  });

  expect(metrics.length).toBeGreaterThan(0);
  for (const metric of metrics) {
    expect(metric.controlLeft).toBeGreaterThanOrEqual(metric.containerLeft - 1);
    expect(metric.controlRight).toBeLessThanOrEqual(metric.containerRight + 1);
    expect(metric.minInlineSize).toBe('0px');
    expect(metric.maxInlineSize).toBe('100%');
    if (metric.type === 'date') {
      expect(metric.controlHeight).toBe(40);
      expect(metric.appearance).toBe('none');
      expect(metric.lineHeight).toBe('38px');
      expect(metric.maxHeight).toBe('40px');
      expect(metric.paddingBlockStart).toBe('0px');
      expect(metric.paddingBlockEnd).toBe('0px');
      expect(Number.parseFloat(metric.paddingInlineStart)).toBeGreaterThan(0);
      expect(Number.parseFloat(metric.paddingInlineEnd)).toBeGreaterThan(0);
      expect(metric.textAlign).toBe('center');
    }
  }
}

test('form controls stay within admin panels on narrow screens', async ({ page, request }) => {
  await loginByApi(request);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/admin/reservations');
  await expectFormControlsContained(page.locator('.filter-bar'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto('/admin/settings');
  await expectFormControlsContained(page.getByTestId('settings-form'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto('/admin/timetable');
  await expectFormControlsContained(page.locator('.timetable-panel'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByTestId('timetable-new-request-button').click();
  const requestPanel = page.getByTestId('timetable-quick-add-panel');
  await expectFormControlsContained(requestPanel);
  const requestControlHeights = await Promise.all([
    page.getByTestId('quick-add-start-input-date').evaluate((element) => element.getBoundingClientRect().height),
    page.getByTestId('quick-add-start-input').evaluate((element) => element.getBoundingClientRect().height),
  ]);
  expect(requestControlHeights).toEqual([40, 40]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto('/admin/audit');
  await expectFormControlsContained(page.locator('.audit-filter'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto('/admin/recurrences');
  await expectFormControlsContained(page.getByTestId('recurrence-form'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto('/admin/rooms');
  await expectFormControlsContained(page.getByTestId('room-form'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto('/admin/settings/tags');
  await page.locator('.page-header .primary-button').click();
  await expectFormControlsContained(page.locator('.quick-add-form'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('reservation list filters are reflected in URL query and survive reload', async ({ page, request }) => {
  await loginByApi(request);
  await page.goto('/admin/reservations');

  await page.getByTestId('reservation-status-filter').selectOption('CONFIRMED');
  await expect(page).toHaveURL(/status=CONFIRMED/);
  await page.getByTestId('reservation-keyword-filter').fill('testing-');
  await expect(page).toHaveURL(/keyword=testing-/);
  await page.getByTestId('reservation-from-date-filter').fill('2026-05-01');
  await page.getByTestId('reservation-search-button').click();

  await expect(page).toHaveURL(/status=CONFIRMED/);
  await expect(page).toHaveURL(/keyword=testing-/);
  await expect(page).toHaveURL(/fromDate=2026-05-01/);
  await expect(page).toHaveURL(/page=0/);

  await page.reload();

  await expect(page.getByTestId('reservation-status-filter')).toHaveValue('CONFIRMED');
  await expect(page.getByTestId('reservation-keyword-filter')).toHaveValue('testing-');
  await expect(page.getByTestId('reservation-from-date-filter')).toHaveValue('2026-05-01');
});

test('reservation list and detail expose timetable links with reservation date and room context', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('timetable-link-room');
  const reservationDay = nextWeekdayReservationLocalInputs({ daysAhead: 21, startHour: 10, endHour: 11 }).date;
  const reservation = await e2eData.createTestReservation(room.id, 'timetable-link', {
    startAt: `${reservationDay}T10:00:00+09:00`,
    endAt: `${reservationDay}T11:00:00+09:00`,
    memo: 'testing-timetable-link-seed',
  });
  const purpose = reservation.purpose || '';

  try {
    await page.goto(`/admin/reservations?keyword=${encodeURIComponent(purpose)}`);
    await page.getByTestId('reservation-row-timetable-link').click();

    await expect(page).toHaveURL(/\/admin\/timetable/);
    await expect(page).toHaveURL(/view=date/);
    await expect(page).toHaveURL(new RegExp(`date=${reservationDay}`));
    await expect(page).toHaveURL(new RegExp(`roomId=${room.id}`));

    await page.goto(`/admin/reservations/${reservation.id}`);
    await expect(page.getByRole('button', { name: '목록으로', exact: true })).toHaveCount(0);
    const detailActions = page.getByTestId('reservation-primary-actions').locator('button, a');
    await expect(detailActions).toHaveText([
      '승인',
      '취소',
      '수정',
      '복제',
    ]);
    const actionTops = await detailActions.evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().top)),
    );
    expect(new Set(actionTops).size).toBe(1);
    await page.getByTestId('reservation-detail-timetable-link').click();

    await expect(page).toHaveURL(/\/admin\/timetable/);
    await expect(page).toHaveURL(/view=date/);
    await expect(page).toHaveURL(new RegExp(`date=${reservationDay}`));
    await expect(page).toHaveURL(new RegExp(`roomId=${room.id}`));
  } finally {
    await cancelReservationByApi(request, reservation.id, 'testing-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('reservation detail action groups remain distinct without horizontal overflow on mobile', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('reservation-mobile-actions-room');
  const reservation = await e2eData.createTestReservation(room.id, 'reservation-mobile-actions');

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/reservations/${reservation.id}`);

    const actions = page.getByTestId('reservation-primary-actions');
    await expect(actions.locator('button, a')).toHaveText(['승인', '취소', '수정', '복제']);
    await expect(page.getByTestId('reservation-edit-link')).toBeVisible();
    await expect(page.getByTestId('reservation-duplicate-link')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await cancelReservationByApi(request, reservation.id, 'testing-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('reservation edit: saved changes are visible on detail and list', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('reservation-edit-room');
  const reservation = await e2eData.createTestReservation(room.id, 'reservation-edit-seed');
  const updatedPurpose = e2eData.name('reservation-edit-updated');

  try {
    await page.goto(`/admin/reservations/${reservation.id}`);
    await page.getByTestId('reservation-edit-link').click();

    await expect(page).toHaveURL(new RegExp(`/admin/reservations/${reservation.id}/edit$`));
    await expectTestIdsInDomOrder(page, [
      'reservation-purpose-input',
      'reservation-room-select',
      'reservation-date-input',
      'reservation-start-input',
      'reservation-end-input',
      'reservation-applicant-name-input',
      'reservation-email-input',
      'reservation-phone-input',
      'reservation-status-select',
      'reservation-memo-input',
    ]);
    await expectTestIdPairsOnSameRow(page, [
      ['reservation-room-select', 'reservation-date-input'],
      ['reservation-start-input', 'reservation-end-input'],
      ['reservation-applicant-name-input', 'reservation-email-input'],
      ['reservation-phone-input', 'reservation-status-select'],
    ]);
    await expect(page.getByTestId('reservation-purpose-input').locator('..')).toHaveClass(/full-span/);
    await expect(page.getByTestId('reservation-status-select')).toBeEditable();
    await expect(page.getByTestId('reservation-memo-input').locator('..')).toHaveClass(/full-span/);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByTestId('reservation-start-input').locator('option[value="09:05"]')).toHaveCount(1);
    await page.getByTestId('reservation-room-select').selectOption({ label: room.name });
    await expect(page.getByTestId('reservation-room-select')).toHaveValue(room.id);
    await page.getByTestId('reservation-purpose-input').fill(updatedPurpose);
    await page.getByTestId('reservation-memo-input').fill('testing-reservation-edit-smoke');
    await page.getByTestId('reservation-save-button').click();

    await expect(page).toHaveURL(new RegExp(`/admin/reservations/${reservation.id}$`));
    await expect(page.getByTestId('reservation-purpose')).toHaveText(updatedPurpose);

    await page.goto(`/admin/reservations?keyword=${encodeURIComponent(updatedPurpose)}`);
    await expect(page.getByTestId('reservations-table')).toContainText(updatedPurpose);
    await expect(page.getByTestId('reservations-table')).toContainText(room.name);
  } finally {
    await cancelReservationByApi(request, reservation.id, 'testing-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('reservation duplicate pre-fills fields and handles unavailable operating days', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const settings = await getSettingsByApi(request);
  const room = await e2eData.createTestRoom('reservation-duplicate-room');
  const tag = await e2eData.createTestTag('reservation-duplicate-series', { color: '#0f766e' });
  const recurrence = await e2eData.createTestRecurringReservation(room.id, 'reservation-duplicate-source', {
    tagId: tag.id,
  });
  const recurrenceResponse = await request.get(`/api/admin/recurrences/${recurrence.recurrenceId}`);
  expect(recurrenceResponse.ok(), await recurrenceResponse.text()).toBeTruthy();
  const recurrenceDetail = await recurrenceResponse.json() as { reservations: Array<{ id: string }> };
  const sourceReservationId = recurrenceDetail.reservations[0]?.id;
  expect(sourceReservationId, JSON.stringify(recurrenceDetail)).toBeTruthy();
  const sourceResponse = await request.get(`/api/admin/reservations/${sourceReservationId}`);
  expect(sourceResponse.ok(), await sourceResponse.text()).toBeTruthy();
  const source = await sourceResponse.json() as {
    room: { id: string; name: string };
    applicantName: string;
    applicantEmail: string;
    applicantPhone: string;
    purpose: string;
    status: string;
    startAt: string;
    endAt: string;
  };
  let duplicatedReservationId: string | undefined;
  const toolbarDefault = newRequestSelection(settings, new Date());
  expect(toolbarDefault.unavailableMessage).toBeUndefined();

  async function expectDuplicateQuickAddPrefill() {
    await expect(page.getByTestId('timetable-quick-add-panel')).toBeVisible();
    await expect(page.getByTestId('quick-add-room-select')).toHaveValue(source.room.id);
    await expect(page.getByTestId('quick-add-applicant-name-input')).toHaveValue(source.applicantName);
    await expect(page.getByTestId('quick-add-email-input')).toHaveValue(source.applicantEmail);
    await expect(page.getByTestId('quick-add-phone-input')).toHaveValue(source.applicantPhone);
    await expect(page.getByTestId('quick-add-purpose-input')).toHaveValue(source.purpose);
    await expect(page.getByTestId('quick-add-status-select')).toHaveValue(source.status);
    await expect(page.getByTestId('quick-add-start-input-date')).toHaveValue(toolbarDefault.selection.date);
    await expect(page.getByTestId('quick-add-start-input')).toHaveValue(toolbarDefault.selection.startAt.slice(11, 16));
    await expect(page.getByTestId('quick-add-end-input')).toHaveValue(toolbarDefault.selection.endAt.slice(11, 16));
    await expect(page.getByTestId('quick-add-start-input')).not.toHaveValue(source.startAt.slice(11, 16));
    await expect(page.getByTestId('quick-add-end-input')).not.toHaveValue(source.endAt.slice(11, 16));
  }

  await page.goto(`/admin/reservations/${sourceReservationId}`);
  await page.getByTestId('reservation-duplicate-link').click();

  await expect(page).toHaveURL(new RegExp(`/admin/timetable\\?duplicateReservationId=${sourceReservationId}$`));
  await expectDuplicateQuickAddPrefill();

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/admin/timetable\\?duplicateReservationId=${sourceReservationId}$`));
  await expectDuplicateQuickAddPrefill();
  await page.getByTestId('quick-add-memo-input').fill('testing-duplicate-create');

  async function submitDuplicate() {
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/reservations') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('quick-add-save-button').click();
    return responsePromise;
  }

  const createResponse = await submitDuplicate();
  const createResponseBody = await createResponse.text();
  expect(createResponse.ok(), createResponseBody).toBeTruthy();

  const duplicated = JSON.parse(createResponseBody) as {
    id: string;
    recurrenceId: string | null;
    series: unknown | null;
    recurrenceException: boolean;
  };
  duplicatedReservationId = duplicated.id;
  e2eData.registerReservation(duplicatedReservationId);

  expect(duplicated.recurrenceId).toBeNull();
  expect(duplicated.series).toBeNull();
  expect(duplicated.recurrenceException).toBe(false);
  await expect(page.getByTestId('timetable-quick-add-panel')).toBeHidden();
  await page.getByTestId('timetable-date-input').fill(toolbarDefault.selection.date);
  await expect(page.getByTestId('reservation-date-timetable')).toContainText(source.purpose);

  await page.goto(`/admin/reservations/${duplicatedReservationId}`);
  await expect(page).toHaveURL(new RegExp(`/admin/reservations/${duplicatedReservationId}$`));
  await expect(page.getByTestId('reservation-purpose')).toHaveText(source.purpose);
  await expect(page.getByRole('heading', { name: source.room.name })).toBeVisible();

  await page.goto(`/admin/reservations?keyword=${encodeURIComponent(source.purpose)}`);
  await expect(page.getByTestId('reservations-table')).toContainText(source.purpose);
});

test('deleted reservation audit row is read-only and detail URL shows domain guidance', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('reservation-delete-room');
  const reservation = await e2eData.createTestReservation(room.id, 'reservation-delete-seed');

  try {
    await page.goto(`/admin/reservations/${reservation.id}`);
    await page.getByTestId('reservation-delete-button').click();
    await expect(page.getByTestId('reservation-delete-modal')).toBeVisible();
    await page.getByTestId('reservation-delete-confirm-button').click();

    await expect(page).toHaveURL(new RegExp(`/admin/audit\\?reservationId=${reservation.id}&action=DELETED`));
    const table = page.getByTestId('audit-table');
    await expect(table.locator('.audit-snapshot-room')).toHaveText(room.name);
    await expect(table.locator('.audit-snapshot-time')).not.toHaveText('-');
    await expect(table).not.toContainText(reservation.purpose || '');
    await expect(table.locator(`a[href="/admin/reservations/${reservation.id}"]`)).toHaveCount(0);

    await page.goto(`/admin/reservations/${reservation.id}`);
    await expect(page).toHaveURL(new RegExp(`/admin/reservations/${reservation.id}$`));
    await expect(page.getByRole('heading', { name: '삭제된 예약입니다' })).toBeVisible();
    await expect(page.getByText('이 예약은 이미 삭제되어 상세 정보를 볼 수 없습니다.')).toBeVisible();

    await page.getByRole('link', { name: '예약 목록으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/admin\/reservations$/);
  } finally {
    await deleteRoomByApi(request, room.id);
  }
});

test('admin can request a reservation from the timetable and see it on detail and list pages', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('reservation-create-room');
  const purpose = e2eData.name('reservation-create');
  const reservationTime = nextWeekdayReservationLocalInputs();
  let createdReservationId: string | undefined;

  try {
    await page.goto(`/admin/timetable?view=date&date=${reservationTime.date}&roomId=${room.id}`);
    await page.getByTestId('timetable-empty-slot').first().click();
    await expect(page.getByTestId('timetable-quick-add-panel')).toBeVisible();
    await expectTestIdsInDomOrder(page, [
      'quick-add-purpose-input',
      'quick-add-room-select',
      'quick-add-start-input-date',
      'quick-add-start-input',
      'quick-add-end-input',
      'quick-add-applicant-name-input',
      'quick-add-email-input',
      'quick-add-phone-input',
      'quick-add-status-select',
      'quick-add-memo-input',
    ]);
    await expectTestIdPairsOnSameRow(page, [
      ['quick-add-room-select', 'quick-add-start-input-date'],
      ['quick-add-start-input', 'quick-add-end-input'],
      ['quick-add-applicant-name-input', 'quick-add-email-input'],
      ['quick-add-phone-input', 'quick-add-status-select'],
    ]);
    await expect(page.getByTestId('quick-add-status-select')).toBeEditable();
    await page.getByTestId('quick-add-room-select').selectOption(room.id);
    await page.getByTestId('quick-add-applicant-name-input').fill('testing-admin');
    await page.getByTestId('quick-add-email-input').fill(`testing-reservation-${Date.now()}@example.test`);
    await page.getByTestId('quick-add-phone-input').fill('010-1111-2222');
    await page.getByTestId('quick-add-purpose-input').fill(purpose);
    await page.getByTestId('quick-add-start-input-date').fill(reservationTime.date);
    await page.getByTestId('quick-add-start-input').selectOption(reservationTime.startAt.slice(11, 16));
    await page.getByTestId('quick-add-end-input').selectOption(reservationTime.endAt.slice(11, 16));
    await page.getByTestId('quick-add-memo-input').fill('testing-create-verification');

    await expect(page.getByTestId('quick-add-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('quick-add-purpose-input')).toHaveValue(purpose);
    await expect(page.getByTestId('quick-add-start-input')).toHaveValue(reservationTime.startAt.slice(11, 16));
    await expect(page.getByTestId('quick-add-end-input')).toHaveValue(reservationTime.endAt.slice(11, 16));

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/reservations') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('quick-add-save-button').click();
    const createResponse = await createResponsePromise;
    const createResponseBody = await createResponse.text();
    expect(createResponse.ok(), createResponseBody).toBeTruthy();

    const created = JSON.parse(createResponseBody) as { id: string };
    createdReservationId = created.id;
    e2eData.registerReservation(createdReservationId);

    await expect(page.getByTestId('reservation-date-timetable')).toContainText(purpose);
    await page.getByText(purpose).click();
    await expect(page).toHaveURL(new RegExp(`/admin/reservations/${createdReservationId}$`));
    await expect(page.getByTestId('reservation-purpose')).toHaveText(purpose);
    await expect(page.getByRole('heading', { name: room.name })).toBeVisible();
    await expect(page.locator('.reservation-detail-main dt')).toHaveCount(6);
    await expect(page.locator('.reservation-detail-main .status-badge')).toBeVisible();
    await expect(page.getByRole('heading', { name: '감사 이력' })).toBeVisible();
    await expect(page.locator('.timeline')).toContainText('testing-create-verification');

    await page.goto(`/admin/reservations?keyword=${encodeURIComponent(purpose)}`);
    await expect(page.getByTestId('reservations-table')).toContainText(purpose);
    await expect(page.getByTestId('reservations-table')).toContainText(room.name);
  } finally {
    if (createdReservationId) {
      await cancelReservationByApi(request, createdReservationId, 'testing-cleanup');
    }
    await deleteRoomByApi(request, room.id);
  }
});
