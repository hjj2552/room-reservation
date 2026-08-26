import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { listAllTags } from '../../shared/api/tags';
import type { Tag } from '../../shared/api/types';
import { tagKeys } from '../../shared/hooks/useTags';
import {
  cancelReservationByApi,
  deleteRecurrenceByApi,
  deleteRoomByApi,
  expectTestIdBelow,
  expectTestIdsInDomOrder,
  getSettingsByApi,
  loginByApi,
  nextWeekdayRecurrenceInputs,
  updateReservationPurposeByApi,
} from './helpers';

function tag(index: number): Tag {
  return {
    id: `tag-${index}`,
    name: `Tag ${String(index).padStart(3, '0')}`,
    color: '#245b47',
    createdAt: '2026-01-01T00:00:00+09:00',
    updatedAt: '2026-01-01T00:00:00+09:00',
  };
}

test('all tag options follow every API page and propagate later page errors', async () => {
  const originalFetch = globalThis.fetch;

  try {
    let requests: string[] = [];
    globalThis.fetch = (async (input) => {
      const path = String(input);
      requests.push(path);
      return Response.json({ items: [tag(1)], page: 0, size: 100, totalItems: 1, totalPages: 1 });
    }) as typeof fetch;

    await expect(listAllTags()).resolves.toEqual([tag(1)]);
    expect(requests).toEqual(['/api/admin/tags?page=0&size=100']);

    requests = [];
    globalThis.fetch = (async (input) => {
      const path = String(input);
      requests.push(path);
      const page = new URL(path, 'http://test').searchParams.get('page');
      return Response.json(page === '0'
        ? { items: [tag(1), tag(2)], page: 0, size: 100, totalItems: 3, totalPages: 2 }
        : { items: [tag(3)], page: 1, size: 100, totalItems: 3, totalPages: 2 });
    }) as typeof fetch;

    await expect(listAllTags()).resolves.toEqual([tag(1), tag(2), tag(3)]);
    expect(requests).toEqual([
      '/api/admin/tags?page=0&size=100',
      '/api/admin/tags?page=1&size=100',
    ]);
    expect(tagKeys.allOptions().slice(0, tagKeys.all.length)).toEqual(tagKeys.all);

    requests = [];
    globalThis.fetch = (async (input) => {
      const path = String(input);
      requests.push(path);
      const page = new URL(path, 'http://test').searchParams.get('page');
      return page === '0'
        ? Response.json({ items: [tag(1)], page: 0, size: 100, totalItems: 2, totalPages: 2 })
        : Response.json({ message: 'testing-page-failure' }, { status: 500 });
    }) as typeof fetch;

    await expect(listAllTags()).rejects.toMatchObject({ status: 500 });
    expect(requests).toEqual([
      '/api/admin/tags?page=0&size=100',
      '/api/admin/tags?page=1&size=100',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('recurrence reservation editing preserves one-step detail history and list context', async ({
  page,
  request,
  e2eData,
}) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('recurrence-navigation');
  const recurrence = await e2eData.createTestRecurringReservation(room.id, 'recurrence-navigation');
  const detailResponse = await request.get(`/api/admin/recurrences/${recurrence.recurrenceId}`);
  expect(detailResponse.ok(), await detailResponse.text()).toBeTruthy();
  const detail = await detailResponse.json() as { purpose: string; reservations: Array<{ id: string }> };
  const reservationId = detail.reservations[0]?.id;
  expect(reservationId).toBeTruthy();
  const listUrl = `/admin/recurrences?roomId=${room.id}&keyword=${encodeURIComponent(detail.purpose)}&page=0`;

  await page.goto(listUrl);
  await page.getByRole('row').filter({ hasText: detail.purpose }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/recurrences/${recurrence.recurrenceId}$`));

  const reservationRow = page.getByTestId('recurrence-reservations-table').locator('tbody tr').first();
  await reservationRow.click();
  await expect(page).toHaveURL(new RegExp(`/admin/reservations/${reservationId}$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/admin/recurrences/${recurrence.recurrenceId}$`));

  await page.getByTestId('recurrence-reservations-table').locator('tbody tr').first().click();
  await page.getByTestId('reservation-edit-link').click();
  const updatedPurpose = `${detail.purpose}-updated`;
  await page.getByTestId('reservation-purpose-input').fill(updatedPurpose);
  const updateResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/admin/reservations/${reservationId}`
    && response.request().method() === 'PUT'
  ));
  await page.getByTestId('reservation-save-button').click();
  await updateResponse;
  await expect(page).toHaveURL(new RegExp(`/admin/reservations/${reservationId}$`));
  await expect(page.getByTestId('reservation-purpose')).toHaveText(updatedPurpose);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/admin/recurrences/${recurrence.recurrenceId}$`));
  await page.getByRole('button', { name: '목록으로', exact: true }).click();
  await expect(page).toHaveURL((url) => (
    url.pathname === '/admin/recurrences'
    && url.searchParams.get('roomId') === room.id
    && url.searchParams.get('keyword') === detail.purpose
    && url.searchParams.get('page') === '0'
  ));
});

test('recurrence end date uses an inclusive 366-day native limit without rewriting the value', async ({ page, request }) => {
  await loginByApi(request);
  await page.goto('/admin/recurrences');
  const startDate = page.getByTestId('recurrence-start-date-input');
  const endDate = page.getByTestId('recurrence-end-date-input');

  await startDate.fill('2024-02-29');
  await expect(endDate).toHaveAttribute('max', '2025-02-28');
  await endDate.fill('2025-02-28');

  await startDate.fill('2024-01-01');
  await expect(endDate).toHaveAttribute('max', '2024-12-31');
  await expect(endDate).toHaveValue('2025-02-28');
  expect(await endDate.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);
});

test('recurrence smoke: list, preview, create, detail, and hard delete', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('recurrence-room');
  const purpose = e2eData.name('recurring-smoke');
  const recurrenceTime = nextWeekdayRecurrenceInputs({ weeks: 1 });
  const settings = await getSettingsByApi(request);
  let recurrenceId: string | undefined;
  let deleted = false;

  try {
    await page.goto(`/admin/recurrences?keyword=${encodeURIComponent(purpose)}&page=0`);
    await expect(page.getByTestId('recurrence-form')).toBeVisible();
    await expectTestIdsInDomOrder(page, [
      'recurrence-applicant-name-input',
      'recurrence-show-applicant-name-input',
      'recurrence-phone-input',
      'recurrence-email-input',
    ]);
    await expect(
      page.getByTestId('recurrence-conflict-policy-select').locator('xpath=ancestor::label'),
    ).toContainText('충돌 정책');
    await expect(page.getByTestId('recurrence-start-time-input').locator('option[value="09:05"]')).toHaveCount(1);
    await expect(page.getByTestId('recurrence-start-time-input')).toHaveValue(settings.openTime.slice(0, 5));
    await expect(page.getByTestId('recurrence-end-time-input')).toHaveValue(
      addMinutesToTime(settings.openTime, settings.minReservationMinutes),
    );
    await expect(page.getByTestId('recurrences-table').or(page.getByText('조건에 맞는 반복 예약이 없습니다.'))).toBeVisible();
    await expectTestIdBelow(page, 'recurrence-applicant-name-input', 'recurrence-show-applicant-name-input');
    await expect(page.getByTestId('recurrence-show-applicant-name-input').locator('xpath=ancestor::fieldset')).toHaveCount(0);

    await page.getByTestId('recurrence-room-select').selectOption(room.id);
    await page.getByTestId('recurrence-applicant-name-input').fill('testing-recurrence-admin');
    await page.getByTestId('recurrence-purpose-input').fill(purpose);
    await page.getByTestId('recurrence-start-date-input').fill(recurrenceTime.startDate);
    await page.getByTestId('recurrence-end-date-input').fill(recurrenceTime.endDate);
    await page.getByTestId('recurrence-start-time-input').selectOption(recurrenceTime.startTime);
    await page.getByTestId('recurrence-end-time-input').selectOption(recurrenceTime.endTime);
    await page.getByTestId('recurrence-day-THU').check();
    await page.getByTestId('recurrence-day-TUE').check();
    await page.getByTestId('recurrence-day-WED').check();
    await page.getByTestId('recurrence-conflict-policy-select').selectOption('FAIL_ALL');
    await page.getByTestId('recurrence-show-applicant-name-input').check();

    const previewResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/recurrences/preview') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('recurrence-preview-button').click();
    const previewResponse = await previewResponsePromise;
    const previewBody = await previewResponse.text();
    const previewRequest = JSON.parse(previewResponse.request().postData() || '{}') as {
      applicantPhone?: string | null;
      daysOfWeek?: string[];
    };
    expect(previewRequest.applicantPhone).toBeNull();
    expect(previewRequest.daysOfWeek).toEqual(['TUE', 'WED', 'THU']);
    expect(previewResponse.ok(), previewBody).toBeTruthy();
    const preview = JSON.parse(previewBody) as { availableCount: number; totalCandidates: number };
    expect(preview.totalCandidates, previewBody).toBeGreaterThan(0);
    expect(preview.availableCount, previewBody).toBeGreaterThan(0);
    await expect(page.getByTestId('recurrence-preview-summary')).toContainText(String(preview.availableCount));
    await expect(page.getByTestId('recurrence-preview-table').getByRole('columnheader')).toHaveText([
      '날짜',
      '시간',
      '결과',
    ]);
    const previewCells = page.getByTestId('recurrence-preview-table').locator('tbody tr').first().locator('td');
    const [previewDate, previewTime] = await Promise.all([
      previewCells.nth(0).innerText(),
      previewCells.nth(1).innerText(),
    ]);
    expect(previewDate).toMatch(/\d{4}/);
    expect(previewTime).toMatch(/오전|오후/);
    expect(previewTime).not.toContain(previewDate);
    expect(await previewCells.evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).display)))
      .toEqual(['table-cell', 'table-cell', 'table-cell']);
    const previewCellBoxes = await previewCells.evaluateAll((cells) => cells.map((cell) => {
      const box = cell.getBoundingClientRect();
      return { left: box.left, right: box.right, scrollWidth: cell.scrollWidth, clientWidth: cell.clientWidth };
    }));
    previewCellBoxes.forEach((cell, index) => {
      expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth + 1);
      if (index < previewCellBoxes.length - 1) {
        expect(cell.right).toBeLessThanOrEqual(previewCellBoxes[index + 1].left + 1);
      }
    });

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/recurrences' && response.request().method() === 'POST';
    });
    await expect(page.getByTestId('recurrence-create-button')).toBeEnabled();
    await page.getByTestId('recurrence-create-button').click();
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.text();
    const createRequest = JSON.parse(createResponse.request().postData() || '{}') as {
      applicantEmail?: string | null;
      applicantPhone?: string | null;
      showApplicantName?: boolean;
      daysOfWeek?: string[];
    };
    expect(createRequest.applicantEmail).toBeNull();
    expect(createRequest.applicantPhone).toBeNull();
    expect(createRequest.showApplicantName).toBe(true);
    expect(createRequest.daysOfWeek).toEqual(['TUE', 'WED', 'THU']);
    expect(createResponse.ok(), createBody).toBeTruthy();
    const created = JSON.parse(createBody) as { recurrenceId: string; createdCount: number };
    recurrenceId = created.recurrenceId;
    e2eData.registerRecurrence(recurrenceId);
    expect(created.createdCount, createBody).toBeGreaterThan(0);

    await page.route('**/api/admin/recurrences?**', async (route) => {
      const response = await route.fetch();
      const body = await response.json() as { items: Array<{ id: string; daysOfWeek: string }> };
      await route.fulfill({
        response,
        json: {
          ...body,
          items: body.items.map((item) => item.id === recurrenceId
            ? { ...item, daysOfWeek: 'THU,TUE,WED' }
            : item),
        },
      });
    }, { times: 1 });
    await page.goto(`/admin/recurrences?keyword=${encodeURIComponent(purpose)}&page=0`);
    let row = page.getByRole('row').filter({ hasText: purpose });
    const recurrenceTable = page.getByTestId('recurrences-table');
    await expect(recurrenceTable.getByRole('columnheader')).toHaveText([
      '기간',
      '요일/시간',
      '공간',
      '목적',
      '상세',
    ]);
    await expect(page.getByTestId('recurrence-status-filter')).toHaveCount(0);
    await expect(recurrenceTable.getByRole('columnheader', { name: '상태' })).toHaveCount(0);
    await expect(recurrenceTable.getByRole('columnheader', { name: /등록 정책|충돌 정책/ })).toHaveCount(0);
    await expect(row.locator('.plain-badge')).toHaveCount(0);
    await expect(row.getByText(room.name, { exact: true })).not.toHaveAttribute('href');
    await expect(row.getByRole('link', { name: '상세 보기' })).toHaveAttribute(
      'href',
      `/admin/recurrences/${recurrenceId}`,
    );
    await expect(row).toContainText('화, 수, 목');
    await page.reload();
    row = page.getByRole('row').filter({ hasText: purpose });
    await expect(row).toContainText('화, 수, 목');

    await page.route(`**/api/admin/recurrences/${recurrenceId}`, async (route) => {
      const response = await route.fetch();
      const body = await response.json() as { daysOfWeek: string };
      await route.fulfill({ response, json: { ...body, daysOfWeek: 'THU,TUE,WED' } });
    }, { times: 1 });
    await row.getByRole('link', { name: '상세 보기' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/recurrences/${recurrenceId}$`));
    await page.goBack();
    row = page.getByRole('row').filter({ hasText: purpose });
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/admin/recurrences/${recurrenceId}$`));
    await page.goBack();
    row = page.getByRole('row').filter({ hasText: purpose });
    await row.focus();
    await row.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/admin/recurrences/${recurrenceId}$`));
    await expect(page.getByRole('heading', { name: room.name })).toBeVisible();
    await expect(page.getByTestId('recurrence-detail-purpose')).toHaveText(purpose);
    await expect(page.getByTestId('recurrence-detail-room')).toContainText(room.name);
    await expect(page.getByTestId('recurrence-detail-schedule')).toContainText('화, 수, 목');
    await expect(page.getByTestId('recurrence-detail-applicant-name')).toContainText('(공개)');
    await expect(page.getByTestId('recurrence-detail-applicant-phone').locator('span').first()).toHaveText('-');
    await expect(page.getByTestId('recurrence-detail-applicant-phone')).toContainText('(비공개)');
    await expect(page.getByTestId('recurrence-detail-applicant-email').locator('span').first()).toHaveText('-');
    await expect(page.getByTestId('recurrence-detail-applicant-email')).toContainText('(비공개)');
    await expectTestIdsInDomOrder(page, [
      'recurrence-detail-applicant-name',
      'recurrence-detail-applicant-phone',
      'recurrence-detail-applicant-email',
    ]);
    await expect(page.getByTestId('recurrence-detail-status')).toHaveCount(0);
    await expect(page.getByText('충돌 정책', { exact: true })).toBeVisible();

    const detailResponse = await request.get(`/api/admin/recurrences/${recurrenceId}`);
    expect(detailResponse.ok()).toBe(true);
    const recurrenceDetail = await detailResponse.json() as {
      reservations: Array<{ id: string; purpose: string; status: 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' }>;
    };
    expect(recurrenceDetail.reservations.length).toBeGreaterThanOrEqual(2);
    const [modifiedReservation, cancelledReservation] = recurrenceDetail.reservations;
    const modifiedPurpose = `${purpose}-modified`;
    await updateReservationPurposeByApi(request, modifiedReservation.id, modifiedPurpose);
    await cancelReservationByApi(request, cancelledReservation.id, 'testing-recurrence-child-cancel');

    await page.reload();
    const shortPageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.route(`**/api/admin/recurrences/${recurrenceId}`, async (route) => {
      const response = await route.fetch();
      const body = await response.json() as {
        reservations: Array<Record<string, unknown> & { id: string }>;
      };
      await route.fulfill({
        response,
        json: {
          ...body,
          reservations: Array.from({ length: 24 }, (_, index) => ({
            ...body.reservations[index % body.reservations.length],
            id: `${body.reservations[index % body.reservations.length].id}-layout-${index}`,
          })),
        },
      });
    }, { times: 1 });
    await page.reload();
    const recurrenceReservationsTable = page.getByTestId('recurrence-reservations-table');
    const recurrenceReservationsWrapper = recurrenceReservationsTable.locator('xpath=..');
    await expect(recurrenceReservationsTable.getByRole('columnheader')).toHaveText([
      '예약 시간',
      '공간',
      '상태',
      '목적',
      '시간표',
    ]);
    await expect(recurrenceReservationsTable).toContainText(modifiedPurpose);
    await expect(recurrenceReservationsTable).toContainText('개별 수정됨');
    await expect(page.getByTestId('recurrence-reservations-table')).toContainText('취소');
    await expect(recurrenceReservationsTable.locator('tbody tr')).toHaveCount(24);
    const verticalMetrics = await recurrenceReservationsWrapper.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      maxHeight: getComputedStyle(element).maxHeight,
      pageHeight: document.documentElement.scrollHeight,
    }));
    expect(verticalMetrics.scrollHeight).toBeLessThanOrEqual(verticalMetrics.clientHeight + 1);
    expect(verticalMetrics.maxHeight).toBe('none');
    expect(verticalMetrics.pageHeight).toBeGreaterThan(shortPageHeight);

    for (const width of [1920, 1440]) {
      await page.setViewportSize({ width, height: 1080 });
      const sizes = await recurrenceReservationsWrapper.evaluate((element) => ({
        wrapper: element.getBoundingClientRect().width,
        container: element.parentElement?.getBoundingClientRect().width ?? 0,
        scroll: element.scrollWidth,
        client: element.clientWidth,
      }));
      expect(Math.abs(sizes.wrapper - sizes.container)).toBeLessThanOrEqual(1);
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);

      const firstRowCells = recurrenceReservationsTable.locator('tbody tr').first().locator('td');
      expect(await firstRowCells.evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).display)))
        .toEqual(['table-cell', 'table-cell', 'table-cell', 'table-cell', 'table-cell']);
      const [timeBox, roomBox] = await Promise.all([
        firstRowCells.nth(0).locator('.table-cell-stack').boundingBox(),
        firstRowCells.nth(1).boundingBox(),
      ]);
      const timeLines = firstRowCells.nth(0).locator('.table-cell-stack > span');
      await expect(timeLines).toHaveCount(2);
      await expect(timeLines.nth(0)).toContainText(/\([월화수목금토일]\)/);
      await expect(timeLines.nth(1)).toContainText(/^~ .*\([월화수목금토일]\)/);
      if (!timeBox || !roomBox) throw new Error('Could not measure recurrence reservation cells.');
      expect(timeBox.x + timeBox.width).toBeLessThanOrEqual(roomBox.x + 1);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await recurrenceReservationsWrapper.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(recurrenceReservationsTable.locator('tbody tr')).toHaveCount(recurrenceDetail.reservations.length);

    await expect(page.getByTestId('recurrence-delete-button')).toBeVisible();
    await page.getByTestId('recurrence-delete-button').click();

    const deleteModal = page.getByTestId('recurrence-delete-modal');
    await expect(deleteModal).toContainText(
      `연결된 개별 예약 ${recurrenceDetail.reservations.length}건도 모두 영구 삭제되며 되돌릴 수 없습니다.`,
    );
    await expect(page.getByTestId('recurrence-delete-summary')).toContainText(`전체${recurrenceDetail.reservations.length}건`);
    await expect(page.getByTestId('recurrence-delete-summary')).toContainText(`승인${recurrenceDetail.reservations.length - 1}건`);
    await expect(page.getByTestId('recurrence-delete-summary')).toContainText('취소1건');
    await expect(deleteModal).toContainText('개별 수정된 예약 1건과 이미 취소된 예약 1건도 삭제 대상입니다.');
    await page.getByTestId('recurrence-delete-memo-input').fill('testing-recurrence-hard-delete');

    await page.route(`**/api/admin/recurrences/${recurrenceId}`, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        json: { code: 'SERVICE_UNAVAILABLE', message: 'testing transient recurrence delete failure' },
      });
    }, { times: 1 });
    const failedDeleteResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/admin/recurrences/${recurrenceId}`
      && response.request().method() === 'DELETE',
    );
    await page.getByTestId('recurrence-delete-confirm-button').click();
    expect((await failedDeleteResponsePromise).status()).toBe(503);
    await expect(deleteModal).toBeVisible();
    await expect(deleteModal.getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('recurrence-delete-memo-input')).toHaveValue('testing-recurrence-hard-delete');
    await expect(page.getByTestId('recurrence-delete-confirm-button')).toBeEnabled();
    expect((await request.get(`/api/admin/recurrences/${recurrenceId}`)).status()).toBe(200);
    for (const reservation of recurrenceDetail.reservations) {
      expect((await request.get(`/api/admin/reservations/${reservation.id}`)).status()).toBe(200);
    }

    const deleteResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/admin/recurrences/${recurrenceId}`
      && response.request().method() === 'DELETE',
    );
    await page.getByTestId('recurrence-delete-confirm-button').click();
    const deleteResponse = await deleteResponsePromise;
    expect(deleteResponse.status()).toBe(204);
    deleted = true;

    await expect(page).toHaveURL((url) => (
      url.pathname === '/admin/recurrences'
      && url.searchParams.get('keyword') === purpose
      && url.searchParams.get('page') === '0'
    ));
    row = page.getByRole('row').filter({ hasText: purpose });
    await expect(row).toHaveCount(0);
    expect((await request.get(`/api/admin/recurrences/${recurrenceId}`)).status()).toBe(404);
    for (const reservation of recurrenceDetail.reservations) {
      expect((await request.get(`/api/admin/reservations/${reservation.id}`)).status()).toBe(404);
      const historyResponse = await request.get(
        `/api/admin/audit/reservation-histories?reservationId=${reservation.id}&action=DELETED&page=0&size=20`,
      );
      expect(historyResponse.ok()).toBe(true);
      const histories = await historyResponse.json() as { items: Array<{ action: string; memo: string | null }> };
      expect(histories.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'DELETED', memo: 'testing-recurrence-hard-delete' }),
      ]));
    }
  } finally {
    if (recurrenceId && !deleted) {
      await deleteRecurrenceByApi(request, recurrenceId, 'testing-cleanup');
    }
    await deleteRoomByApi(request, room.id);
  }
});

test('recurrence SKIP_CONFLICTS records a conflicting candidate as cancelled', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('recurrence-skip-room');
  const purpose = e2eData.name('recurring-skip-conflicts');
  const recurrenceTime = nextWeekdayRecurrenceInputs({ daysAhead: 35, weeks: 1 });
  const blocker = await e2eData.createTestReservation(room.id, 'recurrence-blocker', {
    startAt: recurrenceTime.firstStartAt,
    endAt: recurrenceTime.firstEndAt,
    memo: 'testing-recurrence-conflict-blocker',
  });
  let recurrenceId: string | undefined;

  try {
    await page.goto('/admin/recurrences');
    await page.getByTestId('recurrence-room-select').selectOption(room.id);
    await page.getByTestId('recurrence-applicant-name-input').fill('testing-recurrence-admin');
    await page.getByTestId('recurrence-email-input').fill(`testing-recurrence-skip-${Date.now()}@example.test`);
    await page.getByTestId('recurrence-phone-input').fill('010-2222-3333');
    await page.getByTestId('recurrence-purpose-input').fill(purpose);
    await page.getByTestId('recurrence-start-date-input').fill(recurrenceTime.startDate);
    await page.getByTestId('recurrence-end-date-input').fill(recurrenceTime.endDate);
    await page.getByTestId('recurrence-start-time-input').selectOption(recurrenceTime.startTime);
    await page.getByTestId('recurrence-end-time-input').selectOption(recurrenceTime.endTime);
    await page.getByTestId(`recurrence-day-${recurrenceTime.dayOfWeek}`).check();
    await page.getByTestId('recurrence-conflict-policy-select').selectOption('SKIP_CONFLICTS');
    await expect(page.getByTestId('recurrence-conflict-policy-select').locator('option:checked'))
      .toHaveText('충돌 건은 취소로 기록');

    const previewResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/recurrences/preview') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('recurrence-preview-button').click();
    const previewResponse = await previewResponsePromise;
    const previewBody = await previewResponse.text();
    expect(previewResponse.ok(), previewBody).toBeTruthy();
    const preview = JSON.parse(previewBody) as {
      totalCandidates: number;
      availableCount: number;
      conflictCount: number;
    };
    expect(preview.totalCandidates, previewBody).toBe(2);
    expect(preview.availableCount, previewBody).toBe(1);
    expect(preview.conflictCount, previewBody).toBe(1);
    await expect(page.getByTestId('recurrence-preview-summary')).toContainText('충돌 취소');
    await expect(page.getByTestId('recurrence-preview-table')).toContainText('충돌 → 취소로 기록 예정');

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/recurrences' && response.request().method() === 'POST';
    });
    await expect(page.getByTestId('recurrence-create-button')).toBeEnabled();
    await page.getByTestId('recurrence-create-button').click();
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.text();
    expect(createResponse.ok(), createBody).toBeTruthy();
    const created = JSON.parse(createBody) as {
      recurrenceId: string;
      createdCount: number;
      cancelledCount: number;
      skippedCount: number;
      failedCount: number;
      items: Array<{ status: string; reason: string | null }>;
    };
    recurrenceId = created.recurrenceId;
    e2eData.registerRecurrence(recurrenceId);
    expect(created.createdCount, createBody).toBe(1);
    expect(created.cancelledCount, createBody).toBe(1);
    expect(created.skippedCount, createBody).toBe(0);
    expect(created.items.map((item) => item.status)).toEqual(['CANCELLED', 'CREATED']);
    expect(created.items[0].reason).toBe('TIME_SLOT_CONFLICT');
    await expect(page.locator('.success-box')).toHaveText(
      `‘${purpose}’ 등록 완료: 등록 1건, 충돌 취소 1건, 건너뜀 0건, 실패 ${created.failedCount}건`,
    );

    await page.goto(`/admin/recurrences?keyword=${encodeURIComponent(purpose)}&page=0`);
    const recurrenceRow = page.getByTestId('recurrences-table').locator('tbody tr').filter({ hasText: purpose });
    await expect(recurrenceRow).not.toContainText('충돌 건은 취소로 기록');
    await page.goto(`/admin/recurrences/${recurrenceId}`);
    await expect(page.getByTestId('recurrence-detail-purpose')).toHaveText(purpose);
    await expect(page.getByTestId('recurrence-detail-schedule')).toContainText(dayLabel(recurrenceTime.dayOfWeek));
    await expect(page.getByText('충돌 건은 취소로 기록', { exact: true })).toBeVisible();
    const recurrenceReservations = page.getByTestId('recurrence-reservations-table').locator('tbody tr');
    await expect(recurrenceReservations).toHaveCount(2);
    await expect(recurrenceReservations.filter({ hasText: '취소' })).toHaveCount(1);
    await expect(recurrenceReservations.filter({ hasText: '승인' })).toHaveCount(1);

    const detailResponse = await request.get(`/api/admin/recurrences/${recurrenceId}`);
    expect(detailResponse.ok()).toBe(true);
    const detail = await detailResponse.json() as {
      reservations: Array<{ id: string; status: string; source?: string; recurrenceId?: string }>;
    };
    expect(detail.reservations.map((reservation) => reservation.status)).toEqual(['CANCELLED', 'CONFIRMED']);

    await page.goto(`/admin/reservations?status=CANCELLED&keyword=${encodeURIComponent(purpose)}&page=0`);
    await expect(page.getByTestId('reservations-table')).toContainText(purpose);
    await expect(page.getByTestId('reservations-table')).toContainText('취소');
  } finally {
    if (recurrenceId) {
      await deleteRecurrenceByApi(request, recurrenceId, 'testing-cleanup');
    }
    await cancelReservationByApi(request, blocker.id, 'testing-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('recurrence form loads every tag page and surfaces later page failures', async ({ page }) => {
  const room = {
    id: 'testing-room-all-tags',
    name: 'Testing Room',
    location: null,
    capacity: 10,
    description: null,
    enabled: true,
    displayOrder: 0,
  };
  const settings = {
    organizationName: 'Testing Organization',
    publicNotice: null,
    reservationEnabled: true,
    reservationDisabledMessage: null,
    semesterStartDate: '2026-01-01',
    semesterEndDate: '2026-12-31',
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
  };
  const recurrenceTime = nextWeekdayRecurrenceInputs({ daysAhead: 42 });
  const tags = Array.from({ length: 101 }, (_, index) => tag(index + 1));
  const tagRequests: string[] = [];
  let failSecondTagPage = false;

  await page.route('**/api/public/settings', (route) => route.fulfill({ json: settings }));
  await page.route('**/api/auth/admin/me', (route) => route.fulfill({
    json: { id: 'testing-admin', username: 'admin', role: 'ADMIN' },
  }));
  await page.route('**/api/admin/settings', (route) => route.fulfill({
    json: { ...settings, version: 1 },
  }));
  await page.route('**/api/admin/rooms/order', (route) => route.fulfill({
    json: { orderVersion: 1, items: [room] },
  }));
  await page.route('**/api/admin/recurrences?**', (route) => route.fulfill({
    json: { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 },
  }));

  await page.route('**/api/admin/tags?**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    tagRequests.push(url.search);
    const pageNumber = Number(url.searchParams.get('page'));
    const size = Number(url.searchParams.get('size'));
    if (failSecondTagPage && size === 100 && pageNumber === 1) {
      await route.fulfill({ status: 500, json: { message: 'testing-page-failure' } });
      return;
    }
    const items = size === 100
      ? tags.slice(pageNumber * size, (pageNumber + 1) * size)
      : tags.slice(0, size);

    await route.fulfill({
      json: {
        items,
        page: pageNumber,
        size,
        totalItems: tags.length,
        totalPages: Math.ceil(tags.length / size),
      },
    });
  });

  await page.route('**/api/admin/recurrences/preview', async (route) => {
    await route.fulfill({
      json: {
        conflictPolicy: 'FAIL_ALL',
        totalCandidates: 1,
        availableCount: 1,
        conflictCount: 0,
        createAllowed: true,
        items: [{
          date: recurrenceTime.startDate,
          startAt: `${recurrenceTime.startDate}T${recurrenceTime.startTime}:00+09:00`,
          endAt: `${recurrenceTime.startDate}T${recurrenceTime.endTime}:00+09:00`,
          available: true,
          reason: null,
          message: null,
        }],
      },
    });
  });

  await page.route('**/api/admin/recurrences', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 201,
      json: {
        recurrenceId: 'testing-recurrence-all-tags',
        tagId: tags[100].id,
        tagName: tags[100].name,
        tagColor: tags[100].color,
        conflictPolicy: 'FAIL_ALL',
        totalCandidates: 1,
        createdCount: 1,
        cancelledCount: 0,
        skippedCount: 0,
        failedCount: 0,
        items: [{ date: recurrenceTime.startDate, status: 'CREATED', reason: null }],
      },
    });
  });

  await page.goto('/admin/recurrences');
  const tagSelect = page.getByTestId('recurrence-tag-select');
  await expect(tagSelect.locator('option')).toHaveCount(102);
  await expect(tagSelect.locator('option[value=""]')).toHaveCount(1);
  await expect(tagSelect.locator('option').filter({ hasText: tags[0].name })).toHaveCount(1);
  await expect(tagSelect.locator('option').filter({ hasText: tags[100].name })).toHaveCount(1);
  expect(tagRequests).toEqual(['?page=0&size=100', '?page=1&size=100']);

  await fillRecurrenceDraft(page, room.id, 'testing-recurrence-all-tags', recurrenceTime);
  await tagSelect.selectOption(tags[100].id);
  await runRecurrencePreview(page);
  await expect(tagSelect).toHaveValue(tags[100].id);

  const createRequestPromise = page.waitForRequest((request) =>
    new URL(request.url()).pathname === '/api/admin/recurrences'
      && request.method() === 'POST',
  );
  await page.getByTestId('recurrence-create-button').click();
  const createRequest = await createRequestPromise;
  expect((createRequest.postDataJSON() as { tagId?: string }).tagId).toBe(tags[100].id);

  tagRequests.length = 0;
  await page.goto('/admin/settings/tags');
  await expect(page.getByTestId('tags-table')).toBeVisible();
  expect(tagRequests).toEqual(['?page=0&size=20']);

  await page.reload();
  failSecondTagPage = true;
  tagRequests.length = 0;
  await page.goto('/admin/recurrences');
  await expect(page.getByTestId('recurrence-tag-select')).toBeDisabled();
  await expect(page.getByTestId('recurrence-tag-error')).toHaveText(
    '태그 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
  );
  await expect(page.getByTestId('recurrence-tag-select')).toBeDisabled();
  expect(tagRequests.filter((request) => request === '?page=1&size=100').length).toBeGreaterThan(0);
});

test('recurrence create can select a configured tag', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('recurrence-tag-room');
  const tag = await e2eData.createTestTag('recurrence-create', { color: '#dc2626' });
  const purpose = e2eData.name('recurring-tagged');
  const recurrenceTime = nextWeekdayRecurrenceInputs({ daysAhead: 42 });
  let recurrenceId: string | undefined;

  try {
    await page.goto('/admin/recurrences');
    await page.getByTestId('recurrence-room-select').selectOption(room.id);
    await page.getByTestId('recurrence-applicant-name-input').fill('testing-recurrence-tag-admin');
    await page.getByTestId('recurrence-email-input').fill(`testing-recurrence-tag-${Date.now()}@example.test`);
    await page.getByTestId('recurrence-phone-input').fill('010-2222-3333');
    await page.getByTestId('recurrence-purpose-input').fill(purpose);
    await page.getByTestId('recurrence-start-date-input').fill(recurrenceTime.startDate);
    await page.getByTestId('recurrence-end-date-input').fill(recurrenceTime.endDate);
    await page.getByTestId('recurrence-start-time-input').selectOption(recurrenceTime.startTime);
    await page.getByTestId('recurrence-end-time-input').selectOption(recurrenceTime.endTime);
    await expect(page.getByTestId('recurrence-tag-select')).toContainText(tag.name);
    await page.getByTestId('recurrence-tag-select').selectOption(tag.id);
    await page.getByTestId(`recurrence-day-${recurrenceTime.dayOfWeek}`).check();
    await page.getByTestId('recurrence-conflict-policy-select').selectOption('FAIL_ALL');

    const previewResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/recurrences/preview') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('recurrence-preview-button').click();
    const previewResponse = await previewResponsePromise;
    const previewBody = await previewResponse.text();
    expect(previewResponse.ok(), previewBody).toBeTruthy();

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/recurrences' && response.request().method() === 'POST';
    });
    await expect(page.getByTestId('recurrence-create-button')).toBeEnabled();
    await page.getByTestId('recurrence-create-button').click();
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.text();
    expect(createResponse.ok(), createBody).toBeTruthy();
    const created = JSON.parse(createBody) as { recurrenceId: string; createdCount: number };
    recurrenceId = created.recurrenceId;
    e2eData.registerRecurrence(recurrenceId);
    expect(created.createdCount, createBody).toBeGreaterThan(0);

    await page.goto(`/admin/recurrences/${recurrenceId}`);
    await expect(page.getByTestId('recurrence-detail-purpose')).toHaveText(purpose);
    await expect(page.getByTestId('recurrence-detail-tag')).toContainText(tag.name);

    await page.goto('/admin/recurrences');
    const row = page.getByRole('row').filter({ hasText: purpose });
    await expect(row).toBeVisible();
    await expect(row).toContainText(tag.name);
  } finally {
    if (recurrenceId) {
      await deleteRecurrenceByApi(request, recurrenceId, 'testing-cleanup');
    }
  }
});

test('recurrence preview validity follows only the preview condition values', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const firstRoom = await e2eData.createTestRoom('recurrence-preview-first');
  const secondRoom = await e2eData.createTestRoom('recurrence-preview-second');
  const recurrenceTime = nextWeekdayRecurrenceInputs({ daysAhead: 49, weeks: 1 });
  const purpose = e2eData.name('recurring-preview-validity');

  await page.goto('/admin/recurrences');
  await fillRecurrenceDraft(page, firstRoom.id, purpose, recurrenceTime);
  await runRecurrencePreview(page);

  const createButton = page.getByTestId('recurrence-create-button');
  const summary = page.getByTestId('recurrence-preview-summary');
  const staleMessage = page.getByTestId('recurrence-preview-stale');
  await expect(createButton).toBeEnabled();
  await expect(summary).toBeVisible();

  await page.getByTestId('recurrence-room-select').focus();
  await page.keyboard.press('Tab');
  await expect(createButton).toBeEnabled();
  await expect(staleMessage).toBeHidden();

  async function expectStaleUntilRestored(change: () => Promise<void>, restore: () => Promise<void>) {
    await change();
    await expect(createButton).toBeDisabled();
    await expect(staleMessage).toHaveText('반복 조건이 변경되었습니다. 다시 미리보기를 실행해 주세요.');
    await expect(summary).toBeHidden();
    await restore();
    await expect(createButton).toBeEnabled();
    await expect(staleMessage).toBeHidden();
    await expect(summary).toBeVisible();
  }

  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-room-select').selectOption(secondRoom.id),
    () => page.getByTestId('recurrence-room-select').selectOption(firstRoom.id),
  );
  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-start-date-input').fill(shiftDate(recurrenceTime.startDate, 1)),
    () => page.getByTestId('recurrence-start-date-input').fill(recurrenceTime.startDate),
  );
  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-end-date-input').fill(shiftDate(recurrenceTime.endDate, 1)),
    () => page.getByTestId('recurrence-end-date-input').fill(recurrenceTime.endDate),
  );
  const additionalDay = recurrenceTime.dayOfWeek === 'MON' ? 'TUE' : 'MON';
  await expectStaleUntilRestored(
    () => page.getByTestId(`recurrence-day-${additionalDay}`).check(),
    () => page.getByTestId(`recurrence-day-${additionalDay}`).uncheck(),
  );
  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-start-time-input').selectOption(addMinutesToTime(recurrenceTime.startTime, 5)),
    () => page.getByTestId('recurrence-start-time-input').selectOption(recurrenceTime.startTime),
  );
  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-end-time-input').selectOption(addMinutesToTime(recurrenceTime.endTime, 5)),
    () => page.getByTestId('recurrence-end-time-input').selectOption(recurrenceTime.endTime),
  );
  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-conflict-policy-select').selectOption('SKIP_CONFLICTS'),
    () => page.getByTestId('recurrence-conflict-policy-select').selectOption('FAIL_ALL'),
  );

  let releaseRepeatedPreview!: () => void;
  let markRepeatedPreviewStarted!: () => void;
  const repeatedPreviewGate = new Promise<void>((resolve) => { releaseRepeatedPreview = resolve; });
  const repeatedPreviewStarted = new Promise<void>((resolve) => { markRepeatedPreviewStarted = resolve; });
  await page.route('**/api/admin/recurrences/preview', async (route) => {
    markRepeatedPreviewStarted();
    await repeatedPreviewGate;
    await route.continue();
  }, { times: 1 });

  const repeatedPreviewResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/admin/recurrences/preview',
  );
  await page.getByTestId('recurrence-preview-button').click();
  await repeatedPreviewStarted;
  await expect(createButton).toBeDisabled();
  await expect(summary).toBeHidden();
  await expect(staleMessage).toBeHidden();
  releaseRepeatedPreview();
  expect((await repeatedPreviewResponse).ok()).toBe(true);
  await expect(createButton).toBeEnabled();
  await expect(summary).toBeVisible();

  await page.route('**/api/admin/recurrences/preview', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'testing-preview-failure' }),
    });
  }, { times: 1 });
  const failedPreviewResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/admin/recurrences/preview',
  );
  await page.getByTestId('recurrence-preview-button').click();
  expect((await failedPreviewResponse).status()).toBe(503);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(createButton).toBeDisabled();
  await expect(summary).toBeHidden();
  await expect(staleMessage).toBeHidden();
});

test('a late preview response cannot validate changed recurrence conditions', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const firstRoom = await e2eData.createTestRoom('recurrence-late-preview-first');
  const secondRoom = await e2eData.createTestRoom('recurrence-late-preview-second');
  const recurrenceTime = nextWeekdayRecurrenceInputs({ daysAhead: 56, weeks: 1 });
  const purpose = e2eData.name('recurring-late-preview');
  let releasePreview!: () => void;
  let markPreviewStarted!: () => void;
  const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
  const previewStarted = new Promise<void>((resolve) => { markPreviewStarted = resolve; });

  await page.route('**/api/admin/recurrences/preview', async (route) => {
    markPreviewStarted();
    await previewGate;
    await route.continue();
  }, { times: 1 });

  await page.goto('/admin/recurrences');
  await fillRecurrenceDraft(page, firstRoom.id, purpose, recurrenceTime);
  const firstResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/admin/recurrences/preview',
  );
  await page.getByTestId('recurrence-preview-button').click();
  await previewStarted;
  await page.getByTestId('recurrence-room-select').selectOption(secondRoom.id);
  releasePreview();
  expect((await firstResponsePromise).ok()).toBe(true);

  await expect(page.getByTestId('recurrence-create-button')).toBeDisabled();
  await expect(page.getByTestId('recurrence-preview-summary')).toBeHidden();
  await expect(page.getByTestId('recurrence-preview-stale')).toBeVisible();

  await runRecurrencePreview(page);
  await expect(page.getByTestId('recurrence-preview-stale')).toBeHidden();
  await expect(page.getByTestId('recurrence-preview-summary')).toBeVisible();
  await expect(page.getByTestId('recurrence-create-button')).toBeEnabled();
});

test('a pending recurrence create keeps its payload snapshot and the next draft intact', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const firstRoom = await e2eData.createTestRoom('recurrence-create-snapshot-first');
  const secondRoom = await e2eData.createTestRoom('recurrence-create-snapshot-second');
  const tag = await e2eData.createTestTag('recurrence-create-snapshot', { color: '#245b47' });
  const firstTime = nextWeekdayRecurrenceInputs({ daysAhead: 63, weeks: 1 });
  const secondTime = nextWeekdayRecurrenceInputs({ daysAhead: 77, weeks: 1, startHour: 15, endHour: 16 });
  const firstPurpose = e2eData.name('recurring-snapshot-first');
  const submittedPurpose = `${firstPurpose}-submitted`;
  const secondPurpose = e2eData.name('recurring-snapshot-second');

  await page.goto('/admin/recurrences');
  await fillRecurrenceDraft(page, firstRoom.id, firstPurpose, firstTime);
  await runRecurrencePreview(page);

  await page.getByTestId('recurrence-applicant-name-input').fill('testing-snapshot-applicant');
  await page.getByTestId('recurrence-email-input').fill('testing-snapshot@example.test');
  await page.getByTestId('recurrence-phone-input').fill('010-5555-6666');
  await page.getByTestId('recurrence-purpose-input').fill(submittedPurpose);
  await page.getByTestId('recurrence-tag-select').selectOption(tag.id);
  await page.getByTestId('recurrence-show-applicant-name-input').check();
  await expect(page.getByTestId('recurrence-create-button')).toBeEnabled();
  await expect(page.getByTestId('recurrence-preview-stale')).toBeHidden();

  let releaseCreate!: () => void;
  let markCreateStarted!: () => void;
  let createRequestCount = 0;
  let submittedBody: Record<string, unknown> | undefined;
  const createGate = new Promise<void>((resolve) => { releaseCreate = resolve; });
  const createStarted = new Promise<void>((resolve) => { markCreateStarted = resolve; });
  await page.route('**/api/admin/recurrences', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/admin/recurrences' && route.request().method() === 'POST') {
      createRequestCount += 1;
      submittedBody = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
      markCreateStarted();
      await createGate;
    }
    await route.continue();
  });

  const createResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/admin/recurrences'
      && response.request().method() === 'POST',
  );
  const createButton = page.getByTestId('recurrence-create-button');
  await createButton.click();
  await createStarted;
  await expect(createButton).toBeDisabled();
  await createButton.evaluate((button: HTMLButtonElement) => button.click());
  expect(createRequestCount).toBe(1);

  await page.getByTestId('recurrence-room-select').selectOption(secondRoom.id);
  await page.getByTestId('recurrence-applicant-name-input').fill('testing-next-draft-applicant');
  await page.getByTestId('recurrence-email-input').fill('testing-next-draft@example.test');
  await page.getByTestId('recurrence-phone-input').fill('010-7777-8888');
  await page.getByTestId('recurrence-purpose-input').fill(secondPurpose);
  await page.getByTestId('recurrence-start-date-input').fill(secondTime.startDate);
  await page.getByTestId('recurrence-end-date-input').fill(secondTime.endDate);
  await page.getByTestId('recurrence-start-time-input').selectOption(secondTime.startTime);
  await page.getByTestId('recurrence-end-time-input').selectOption(secondTime.endTime);
  await page.getByTestId('recurrence-tag-select').selectOption('');
  await page.getByTestId('recurrence-show-applicant-name-input').uncheck();
  if (secondTime.dayOfWeek !== firstTime.dayOfWeek) {
    await page.getByTestId(`recurrence-day-${firstTime.dayOfWeek}`).uncheck();
    await page.getByTestId(`recurrence-day-${secondTime.dayOfWeek}`).check();
  }

  await runRecurrencePreview(page);
  await expect(page.getByTestId('recurrence-preview-summary')).toBeVisible();
  await expect(page.getByTestId('recurrence-preview-stale')).toBeHidden();
  await expect(createButton).toBeDisabled();

  releaseCreate();
  const createResponse = await createResponsePromise;
  const createBody = await createResponse.text();
  expect(createResponse.ok(), createBody).toBe(true);
  const created = JSON.parse(createBody) as {
    recurrenceId: string;
    createdCount: number;
    cancelledCount: number;
    skippedCount: number;
    failedCount: number;
  };
  e2eData.registerRecurrence(created.recurrenceId);

  expect(createRequestCount).toBe(1);
  expect(submittedBody).toMatchObject({
    roomId: firstRoom.id,
    startDate: firstTime.startDate,
    endDate: firstTime.endDate,
    daysOfWeek: [firstTime.dayOfWeek],
    startTime: `${firstTime.startTime}:00`,
    endTime: `${firstTime.endTime}:00`,
    applicantName: 'testing-snapshot-applicant',
    applicantEmail: 'testing-snapshot@example.test',
    applicantPhone: '010-5555-6666',
    purpose: submittedPurpose,
    tagId: tag.id,
    showApplicantName: true,
  });

  await expect(page.getByTestId('recurrence-room-select')).toHaveValue(secondRoom.id);
  await expect(page.getByTestId('recurrence-purpose-input')).toHaveValue(secondPurpose);
  await expect(page.getByTestId('recurrence-start-date-input')).toHaveValue(secondTime.startDate);
  await expect(page.getByTestId('recurrence-end-date-input')).toHaveValue(secondTime.endDate);
  await expect(page.getByTestId('recurrence-preview-summary')).toBeVisible();
  await expect(createButton).toBeEnabled();
  await expect(page.locator('.success-box')).toHaveText(
    `‘${submittedPurpose}’ 등록 완료: 등록 ${created.createdCount}건, 충돌 취소 ${created.cancelledCount}건, 건너뜀 ${created.skippedCount}건, 실패 ${created.failedCount}건`,
  );
});

function dayLabel(day: string) {
  const labels: Record<string, string> = {
    MON: '월',
    TUE: '화',
    WED: '수',
    THU: '목',
    FRI: '금',
    SAT: '토',
    SUN: '일',
  };
  return labels[day] || day;
}

function addMinutesToTime(value: string, minutesToAdd: number) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  const total = hour * 60 + minute + minutesToAdd;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function fillRecurrenceDraft(
  page: Page,
  roomId: string,
  purpose: string,
  recurrenceTime: ReturnType<typeof nextWeekdayRecurrenceInputs>,
) {
  await page.getByTestId('recurrence-room-select').selectOption(roomId);
  await page.getByTestId('recurrence-applicant-name-input').fill('testing-recurrence-admin');
  await page.getByTestId('recurrence-purpose-input').fill(purpose);
  await page.getByTestId('recurrence-start-date-input').fill(recurrenceTime.startDate);
  await page.getByTestId('recurrence-end-date-input').fill(recurrenceTime.endDate);
  await page.getByTestId('recurrence-start-time-input').selectOption(recurrenceTime.startTime);
  await page.getByTestId('recurrence-end-time-input').selectOption(recurrenceTime.endTime);
  await page.getByTestId(`recurrence-day-${recurrenceTime.dayOfWeek}`).check();
  await page.getByTestId('recurrence-conflict-policy-select').selectOption('FAIL_ALL');
}

async function runRecurrencePreview(page: Page) {
  const responsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/admin/recurrences/preview'
      && response.request().method() === 'POST',
  );
  await page.getByTestId('recurrence-preview-button').click();
  const response = await responsePromise;
  const body = await response.text();
  expect(response.ok(), body).toBe(true);
  return JSON.parse(body) as Record<string, unknown>;
}
