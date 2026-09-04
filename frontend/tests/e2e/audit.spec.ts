import { expect, test } from './fixtures';
import {
  cancelReservationByApi,
  deleteRoomByApi,
  expectTextContentWithinCell,
  loginByApi,
} from './helpers';

test('audit filters are reflected in URL query and render server results', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('audit-room');
  const reservation = await e2eData.createTestReservation(room.id, 'audit-reservation');
  let auditRequestCount = 0;
  page.on('request', (auditRequest) => {
    if (new URL(auditRequest.url()).pathname === '/api/admin/audit/reservation-histories') {
      auditRequestCount += 1;
    }
  });

  try {
    await page.goto('/admin/audit');
    await expect(page.getByTestId('audit-table')).toBeVisible();
    const initialRequestCount = auditRequestCount;
    await page.getByTestId('audit-reservation-id-input').fill(reservation.id);
    await page.getByTestId('audit-room-select').selectOption(room.id);
    await page.getByTestId('audit-action-select').selectOption('CREATED_BY_ADMIN');
    await page.getByTestId('audit-from-date-input').fill('2020-01-01');
    await page.getByTestId('audit-to-date-input').fill('2100-01-01');
    await page.getByTestId('audit-keyword-input').fill('  testing-audit-seed  ');
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    expect(auditRequestCount).toBe(initialRequestCount);
    expect(new URL(page.url()).search).toBe('');

    const submittedRequest = page.waitForRequest((auditRequest) => {
      const url = new URL(auditRequest.url());
      return url.pathname === '/api/admin/audit/reservation-histories'
        && url.searchParams.get('keyword') === 'testing-audit-seed';
    });
    await page.getByTestId('audit-search-button').click();
    await submittedRequest;

    await expect(page).toHaveURL(new RegExp(`reservationId=${reservation.id}`));
    await expect(page).toHaveURL(new RegExp(`roomId=${room.id}`));
    await expect(page).toHaveURL(/action=CREATED_BY_ADMIN/);
    await expect(page).toHaveURL(/keyword=testing-audit-seed/);
    await expect(page).toHaveURL(/page=0/);

    const table = page.getByTestId('audit-table');
    await expect(table).toContainText('testing-audit-seed');
    await expect(table.locator(`a[href="/admin/reservations/${reservation.id}"]`)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('audit-reservation-id-input')).toHaveValue(reservation.id);
    await expect(page.getByTestId('audit-room-select')).toHaveValue(room.id);
    await expect(page.getByTestId('audit-action-select')).toHaveValue('CREATED_BY_ADMIN');
    await expect(page.getByTestId('audit-keyword-input')).toHaveValue('testing-audit-seed');
    await expect(table).toContainText('testing-audit-seed');

    const keywordInput = page.getByTestId('audit-keyword-input');
    const requestCountBeforeComposition = auditRequestCount;
    await keywordInput.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, '감사');
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: '감사',
        inputType: 'insertCompositionText',
        isComposing: true,
      }));
      input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        code: 'Enter',
        isComposing: true,
      }));
      input.form?.requestSubmit();
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '감사' }));
    });
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    expect(auditRequestCount).toBe(requestCountBeforeComposition);
    expect(new URL(page.url()).searchParams.get('keyword')).toBe('testing-audit-seed');

    const completedRequest = page.waitForRequest((auditRequest) => {
      const url = new URL(auditRequest.url());
      return url.pathname === '/api/admin/audit/reservation-histories'
        && url.searchParams.get('keyword') === '감사';
    });
    await keywordInput.press('Enter');
    await completedRequest;
    await expect(page).toHaveURL(/keyword=%EA%B0%90%EC%82%AC/);
  } finally {
    await cancelReservationByApi(request, reservation.id, 'testing-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('audit rows keep a stable target summary and column geometry', async ({ page, request }) => {
  await loginByApi(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  const longPurpose = 'testing-deleted-snapshot-purpose-that-should-not-be-rendered';
  const longActorId = `testing-${'actor'.repeat(30)}@example.invalid`;
  const longRoomName = `testing-${'room'.repeat(45)}`;
  const processingMemo = '첫 번째 처리 내용\n두 번째 처리 내용';
  const longMemo = `${processingMemo}\ntesting-${'unbroken'.repeat(20)}`;

  await page.route('**/api/admin/audit/reservation-histories**', async (route) => {
    const requestedPage = Number(new URL(route.request().url()).searchParams.get('page') || 0);
    const liveItem = {
      id: '00000000-0000-0000-0000-000000000000',
      reservationId: '10000000-0000-0000-0000-000000000000',
      action: 'UPDATED',
      beforeStatus: 'REQUESTED',
      afterStatus: 'CONFIRMED',
      memo: requestedPage === 0 ? longMemo : 'testing-short-memo',
      reservationRoomId: '20000000-0000-0000-0000-000000000000',
      reservationPurpose: 'testing-live-purpose',
      reservationRoomName: longRoomName,
      reservationStartAt: '2026-06-03T10:00:00+09:00',
      reservationEndAt: '2026-06-03T11:00:00+09:00',
      actorType: 'ADMIN',
      actorId: requestedPage === 0 ? longActorId : 'admin',
      createdAt: '2026-05-28T08:59:00+09:00',
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: requestedPage === 0 ? [
          liveItem,
          {
            id: '00000000-0000-0000-0000-000000000001',
            reservationId: '10000000-0000-0000-0000-000000000001',
            action: 'DELETED',
            beforeStatus: 'CONFIRMED',
            afterStatus: null,
            memo: null,
            reservationRoomId: '20000000-0000-0000-0000-000000000001',
            reservationPurpose: longPurpose,
            reservationRoomName: 'testing-deleted-room',
            reservationStartAt: '2026-06-01T10:00:00+09:00',
            reservationEndAt: '2026-06-01T11:00:00+09:00',
            actorType: 'ADMIN',
            actorId: 'admin',
            createdAt: '2026-05-28T09:00:00+09:00',
          },
          {
            id: '00000000-0000-0000-0000-000000000002',
            reservationId: '10000000-0000-0000-0000-000000000002',
            action: 'DELETED',
            beforeStatus: 'REQUESTED',
            afterStatus: null,
            memo: null,
            reservationRoomId: null,
            reservationPurpose: '   ',
            reservationRoomName: 'testing-partial-room',
            reservationStartAt: null,
            reservationEndAt: null,
            actorType: 'ADMIN',
            actorId: 'admin',
            createdAt: '2026-05-28T09:01:00+09:00',
          },
          {
            id: '00000000-0000-0000-0000-000000000003',
            reservationId: '10000000-0000-0000-0000-000000000003',
            action: 'DELETED',
            beforeStatus: null,
            afterStatus: null,
            memo: null,
            reservationRoomId: null,
            reservationPurpose: null,
            reservationRoomName: '   ',
            reservationStartAt: '2026-06-02T12:00:00+09:00',
            reservationEndAt: '2026-06-02T13:00:00+09:00',
            actorType: 'ADMIN',
            actorId: 'admin',
            createdAt: '2026-05-28T09:02:00+09:00',
          },
          {
            id: '00000000-0000-0000-0000-000000000004',
            reservationId: '10000000-0000-0000-0000-000000000004',
            action: 'DELETED',
            beforeStatus: null,
            afterStatus: null,
            memo: null,
            reservationRoomId: null,
            reservationPurpose: null,
            reservationRoomName: null,
            reservationStartAt: null,
            reservationEndAt: null,
            actorType: 'ADMIN',
            actorId: 'admin',
            createdAt: '2026-05-28T09:03:00+09:00',
          },
        ] : [liveItem],
        page: requestedPage,
        size: 20,
        totalItems: 6,
        totalPages: 2,
      }),
    });
  });

  await page.goto('/admin/audit?action=DELETED&keyword=testing-audit-layout&page=0');

  const auditFilter = page.locator('.audit-filter');
  const filterControls = auditFilter.locator(':scope > label > select, :scope > label > input, :scope > button');
  await expect(filterControls).toHaveCount(7);
  expect(await filterControls.evaluateAll((controls) => controls.map((control) => control.getAttribute('data-testid'))))
    .toEqual([
      'audit-action-select',
      'audit-room-select',
      'audit-from-date-input',
      'audit-to-date-input',
      'audit-keyword-input',
      'audit-reservation-id-input',
      'audit-search-button',
    ]);
  await expect(page.getByTestId('audit-keyword-input'))
    .toHaveAttribute('placeholder', '공간, 신청자, 연락처, 목적, 처리자, 메모');
  expect(await page.getByTestId('audit-reservation-id-input').getAttribute('placeholder')).toBeNull();
  const desktopFilterBoxes = await filterControls.evaluateAll((controls) => controls.map((control) => {
    const box = control.getBoundingClientRect();
    return { x: box.x, y: box.y, right: box.right };
  }));
  expect(Math.max(...desktopFilterBoxes.slice(0, 4).map((box) => box.y))
    - Math.min(...desktopFilterBoxes.slice(0, 4).map((box) => box.y))).toBeLessThanOrEqual(1);
  expect(Math.max(...desktopFilterBoxes.slice(4).map((box) => box.y))
    - Math.min(...desktopFilterBoxes.slice(4).map((box) => box.y))).toBeLessThanOrEqual(1);
  expect(desktopFilterBoxes[4].y).toBeGreaterThan(desktopFilterBoxes[0].y);
  expect(await auditFilter.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  const table = page.getByTestId('audit-table');
  await expect(table.getByRole('columnheader')).toHaveText([
    '처리 시각',
    '처리 유형',
    '대상 예약',
    '상태 변경',
    '처리자',
    '메모',
  ]);
  const headerGeometry = await table.getByRole('columnheader').evaluateAll((headers) =>
    headers.map((header) => {
      const box = header.getBoundingClientRect();
      return { x: box.x, width: box.width };
    }),
  );
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0).locator('td').nth(0)).toContainText('2026. 5. 28. (목)');
  const liveSummaryLink = rows.nth(0).locator('.audit-reservation-link');
  await expect(liveSummaryLink).toHaveAttribute('href', '/admin/reservations/10000000-0000-0000-0000-000000000000');
  await expect(liveSummaryLink.locator('.audit-snapshot-room')).toHaveText(longRoomName);
  await expect(liveSummaryLink.locator('.audit-snapshot-time')).toContainText('2026. 6. 3.');
  await expect(liveSummaryLink.locator('.audit-snapshot-time')).toContainText('(수)');
  expect((await liveSummaryLink.locator('.audit-snapshot-time').innerText()).match(/2026\. 6\. 3\./g)).toHaveLength(1);
  await expect(rows.nth(1).locator('.audit-snapshot-room')).toHaveText('testing-deleted-room');
  await expect(rows.nth(1).locator('.audit-snapshot-time')).toContainText('2026. 6. 1.');
  await expect(rows.nth(1).locator('.audit-reservation-snapshot')).not.toContainText(longPurpose);
  await expect(rows.nth(2).locator('.audit-snapshot-room')).toHaveText('testing-partial-room');
  await expect(rows.nth(2).locator('.audit-snapshot-time')).toHaveText('-');
  await expect(rows.nth(3).locator('.audit-snapshot-room')).toHaveText('-');
  await expect(rows.nth(3).locator('.audit-snapshot-time')).toContainText('2026. 6. 2.');
  await expect(rows.nth(4).locator('.audit-snapshot-room')).toHaveText('-');
  await expect(rows.nth(4).locator('.audit-snapshot-time')).toHaveText('-');
  await expect(table.locator('.audit-reservation-link')).toHaveCount(1);
  await expect(table.getByText('상세 보기', { exact: true })).toHaveCount(0);

  expect(await rows.nth(0).locator('.audit-actor-cell .table-text-cell').evaluate((element) => ({
    overflowWrap: getComputedStyle(element).overflowWrap,
    fitsColumn: element.scrollWidth <= element.clientWidth,
  }))).toEqual({ overflowWrap: 'anywhere', fitsColumn: true });
  expect(await rows.nth(0).locator('.processing-memo').evaluate((element) => ({
    wordBreak: getComputedStyle(element).wordBreak,
    fitsColumn: element.scrollWidth <= element.clientWidth,
  }))).toEqual({ wordBreak: 'keep-all', fitsColumn: true });
  const memoCell = rows.nth(0).locator('.processing-memo');
  await expect(memoCell).toHaveCSS('white-space', 'pre-wrap');
  await expect(memoCell).toHaveCSS('overflow-wrap', 'anywhere');
  expect((await memoCell.innerText()).split('\n').slice(0, 2)).toEqual(processingMemo.split('\n'));
  expect(await memoCell.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const processingTimeCell = rows.nth(0).locator('td').nth(0);
  const actionCell = rows.nth(0).locator('td').nth(1);
  const targetCell = rows.nth(0).locator('td').nth(2);
  const statusCell = rows.nth(0).locator('td').nth(3);
  const actorCell = rows.nth(0).locator('td').nth(4);
  const actorId = actorCell.locator('.table-text-cell');
  const memoTableCell = rows.nth(0).locator('td').nth(5);
  expect(await processingTimeCell.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await targetCell.locator('.audit-snapshot-time').evaluate(
    (element) => element.scrollWidth <= element.clientWidth + 1,
  )).toBe(true);
  const [processingBox, actionBox, targetBox, statusBox] = await Promise.all([
    processingTimeCell.boundingBox(),
    actionCell.boundingBox(),
    targetCell.boundingBox(),
    statusCell.boundingBox(),
  ]);
  if (!processingBox || !actionBox || !targetBox || !statusBox) {
    throw new Error('Could not measure audit date columns.');
  }
  expect(processingBox.x + processingBox.width).toBeLessThanOrEqual(actionBox.x + 1);
  expect(targetBox.x + targetBox.width).toBeLessThanOrEqual(statusBox.x + 1);
  await expectTextContentWithinCell(liveSummaryLink.locator('.audit-snapshot-room'), targetCell, statusCell);
  await expectTextContentWithinCell(actorId, actorCell, memoTableCell);
  await expectTextContentWithinCell(memoCell, memoTableCell);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.locator('.pagination-desktop-controls').getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/page=1/);
  await expect(page).toHaveURL(/keyword=testing-audit-layout/);
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody tr')).toContainText('testing-short-memo');
  const nextHeaderGeometry = await table.getByRole('columnheader').evaluateAll((headers) =>
    headers.map((header) => {
      const box = header.getBoundingClientRect();
      return { x: box.x, width: box.width };
    }),
  );
  expect(nextHeaderGeometry).toHaveLength(headerGeometry.length);
  nextHeaderGeometry.forEach((box, index) => {
    expect(Math.abs(box.x - headerGeometry[index].x)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.width - headerGeometry[index].width)).toBeLessThanOrEqual(1);
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/audit?action=DELETED&keyword=testing-audit-layout&page=0');
  const tableWrap = table.locator('xpath=..');
  const mobileFilterBoxes = await filterControls.evaluateAll((controls) => controls.map((control) => {
    const box = control.getBoundingClientRect();
    return { y: box.y, width: box.width };
  }));
  for (let index = 1; index < mobileFilterBoxes.length; index += 1) {
    expect(mobileFilterBoxes[index].y).toBeGreaterThan(mobileFilterBoxes[index - 1].y);
  }
  expect(await auditFilter.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await tableWrap.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});
