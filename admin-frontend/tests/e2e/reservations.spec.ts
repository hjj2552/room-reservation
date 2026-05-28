import { expect, test } from './fixtures';
import {
  cancelReservationByApi,
  deleteRoomByApi,
  loginByApi,
  nextWeekdayReservationLocalInputs,
} from './helpers';

test('reservation list filters are reflected in URL query and survive reload', async ({ page, request }) => {
  await loginByApi(request);
  await page.goto('/reservations');

  await page.getByTestId('reservation-status-filter').selectOption('CONFIRMED');
  await expect(page).toHaveURL(/status=CONFIRMED/);
  await page.getByTestId('reservation-keyword-filter').fill('e2e-');
  await expect(page).toHaveURL(/keyword=e2e-/);
  await page.getByTestId('reservation-from-date-filter').fill('2026-05-01');
  await page.getByTestId('reservation-search-button').click();

  await expect(page).toHaveURL(/status=CONFIRMED/);
  await expect(page).toHaveURL(/keyword=e2e-/);
  await expect(page).toHaveURL(/fromDate=2026-05-01/);
  await expect(page).toHaveURL(/page=0/);

  await page.reload();

  await expect(page.getByTestId('reservation-status-filter')).toHaveValue('CONFIRMED');
  await expect(page.getByTestId('reservation-keyword-filter')).toHaveValue('e2e-');
  await expect(page.getByTestId('reservation-from-date-filter')).toHaveValue('2026-05-01');
});

test('reservation list and detail expose timetable links with reservation date and room context', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('timetable-link-room');
  const reservationDay = nextWeekdayReservationLocalInputs({ daysAhead: 21, startHour: 10, endHour: 11 }).date;
  const reservation = await e2eData.createTestReservation(room.id, 'timetable-link', {
    startAt: `${reservationDay}T10:00:00+09:00`,
    endAt: `${reservationDay}T11:00:00+09:00`,
    memo: 'e2e-timetable-link-seed',
  });
  const purpose = reservation.purpose || '';

  try {
    await page.goto(`/reservations?keyword=${encodeURIComponent(purpose)}`);
    await page.getByTestId('reservation-row-timetable-link').click();

    await expect(page).toHaveURL(/\/timetable/);
    await expect(page).toHaveURL(/view=date/);
    await expect(page).toHaveURL(new RegExp(`date=${reservationDay}`));
    await expect(page).toHaveURL(new RegExp(`roomId=${room.id}`));

    await page.goto(`/reservations/${reservation.id}`);
    await page.getByTestId('reservation-detail-timetable-link').click();

    await expect(page).toHaveURL(/\/timetable/);
    await expect(page).toHaveURL(/view=date/);
    await expect(page).toHaveURL(new RegExp(`date=${reservationDay}`));
    await expect(page).toHaveURL(new RegExp(`roomId=${room.id}`));
  } finally {
    await cancelReservationByApi(request, reservation.id, 'e2e-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('reservation edit: saved changes are visible on detail and list', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('reservation-edit-room');
  const reservation = await e2eData.createTestReservation(room.id, 'reservation-edit-seed');
  const updatedPurpose = e2eData.name('reservation-edit-updated');

  try {
    await page.goto(`/reservations/${reservation.id}`);
    await page.getByTestId('reservation-edit-link').click();

    await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}/edit$`));
    await page.getByTestId('reservation-room-select').selectOption({ label: room.name });
    await expect(page.getByTestId('reservation-room-select')).toHaveValue(room.id);
    await page.getByTestId('reservation-purpose-input').fill(updatedPurpose);
    await page.getByTestId('reservation-memo-input').fill('e2e-reservation-edit-smoke');
    await page.getByTestId('reservation-save-button').click();

    await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}$`));
    await expect(page.getByTestId('reservation-purpose')).toHaveText(updatedPurpose);

    await page.goto(`/reservations?keyword=${encodeURIComponent(updatedPurpose)}`);
    await expect(page.getByTestId('reservations-table')).toContainText(updatedPurpose);
    await expect(page.getByTestId('reservations-table')).toContainText(room.name);
  } finally {
    await cancelReservationByApi(request, reservation.id, 'e2e-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('deleted reservation audit row is read-only and detail URL shows domain guidance', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('reservation-delete-room');
  const reservation = await e2eData.createTestReservation(room.id, 'reservation-delete-seed');

  try {
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('예약을 영구 삭제합니다');
      await dialog.accept();
    });

    await page.goto(`/reservations/${reservation.id}`);
    await page.getByTestId('reservation-delete-button').click();

    await expect(page).toHaveURL(new RegExp(`/audit\\?reservationId=${reservation.id}&action=DELETED`));
    const table = page.getByTestId('audit-table');
    await expect(table.locator('.audit-snapshot-room')).toHaveText(room.name);
    await expect(table.locator('.audit-snapshot-time')).not.toHaveText('-');
    await expect(table).not.toContainText(reservation.purpose || '');
    await expect(table).toContainText('삭제');
    await expect(table.locator(`a[href="/reservations/${reservation.id}"]`)).toHaveCount(0);

    await page.goto(`/reservations/${reservation.id}`);
    await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}$`));
    await expect(page.getByRole('heading', { name: '삭제된 예약입니다' })).toBeVisible();
    await expect(page.getByText('이 예약은 이미 삭제되어 상세 정보를 볼 수 없습니다')).toBeVisible();

    await page.getByRole('link', { name: '예약 목록으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/reservations$/);
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
    await page.goto(`/timetable?view=date&date=${reservationTime.date}&roomId=${room.id}`);
    await page.getByTestId('timetable-empty-slot').first().click();
    await expect(page.getByTestId('timetable-quick-add-panel')).toBeVisible();
    await page.getByTestId('quick-add-room-select').selectOption(room.id);
    await page.getByTestId('quick-add-applicant-name-input').fill('e2e-admin');
    await page.getByTestId('quick-add-email-input').fill(`e2e-reservation-${Date.now()}@example.test`);
    await expect(page.getByTestId('quick-add-phone-input')).toHaveAttribute('placeholder', '- 제외하고 입력');
    await page.getByTestId('quick-add-phone-input').fill('010-1111-2222');
    await page.getByTestId('quick-add-purpose-input').fill(purpose);
    await page.getByTestId('quick-add-start-input').fill(reservationTime.startAt);
    await page.getByTestId('quick-add-end-input').fill(reservationTime.endAt);
    await page.getByTestId('quick-add-memo-input').fill('e2e-create-verification');

    await expect(page.getByTestId('quick-add-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('quick-add-purpose-input')).toHaveValue(purpose);
    await expect(page.getByTestId('quick-add-start-input')).toHaveValue(reservationTime.startAt);
    await expect(page.getByTestId('quick-add-end-input')).toHaveValue(reservationTime.endAt);

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
    await expect(page).toHaveURL(new RegExp(`/reservations/${createdReservationId}$`));
    await expect(page.getByTestId('reservation-purpose')).toHaveText(purpose);
    await expect(page.getByRole('heading', { name: room.name })).toBeVisible();
    await expect(page.locator('.reservation-detail-main dt')).toHaveCount(6);
    await expect(page.locator('.reservation-detail-main .status-badge')).toBeVisible();
    await expect(page.locator('.reservation-detail-main')).toContainText('예약 정보');
    await expect(page.locator('.reservation-detail-main')).toContainText('신청 목적');
    await expect(page.locator('.reservation-detail-main')).toContainText('신청자 이름');
    await expect(page.locator('.reservation-detail-main')).not.toContainText('신청 경로');
    await expect(page.locator('.reservation-detail-main')).not.toContainText('반복 예약');
    await expect(page.locator('.reservation-detail-main')).not.toContainText('예약 요약');
    await expect(page.getByRole('heading', { name: '감사 이력' })).toBeVisible();
    await expect(page.locator('.timeline')).toContainText('관리자 신청');
    await expect(page.locator('.timeline')).toContainText('/ admin');
    await expect(page.locator('.timeline')).toContainText('e2e-create-verification');

    await page.goto(`/reservations?keyword=${encodeURIComponent(purpose)}`);
    await expect(page.getByTestId('reservations-table')).toContainText(purpose);
    await expect(page.getByTestId('reservations-table')).toContainText(room.name);
  } finally {
    if (createdReservationId) {
      await cancelReservationByApi(request, createdReservationId, 'e2e-cleanup');
    }
    await deleteRoomByApi(request, room.id);
  }
});
