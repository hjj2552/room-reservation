import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loginByApi } from './helpers';

interface ListScenario {
  name: string;
  route: string;
  apiPath: string;
  resultsTestId: string;
  tableTestId: string;
  roomFilterTestId: string;
  fromDateFilterTestId: string;
  toDateFilterTestId: string;
  keywordFilterTestId: string;
  searchButtonTestId: string;
  statusFilterTestId?: string;
}

const scenarios: ListScenario[] = [
  {
    name: 'reservation list',
    route: '/admin/reservations',
    apiPath: '/api/admin/reservations',
    resultsTestId: 'reservation-list-results',
    tableTestId: 'reservations-table',
    roomFilterTestId: 'reservation-room-filter',
    fromDateFilterTestId: 'reservation-from-date-filter',
    toDateFilterTestId: 'reservation-to-date-filter',
    keywordFilterTestId: 'reservation-keyword-filter',
    searchButtonTestId: 'reservation-search-button',
    statusFilterTestId: 'reservation-status-filter',
  },
  {
    name: 'recurrence list',
    route: '/admin/recurrences',
    apiPath: '/api/admin/recurrences',
    resultsTestId: 'recurrence-list-results',
    tableTestId: 'recurrences-table',
    roomFilterTestId: 'recurrence-list-room-filter',
    fromDateFilterTestId: 'recurrence-list-from-date-filter',
    toDateFilterTestId: 'recurrence-list-to-date-filter',
    keywordFilterTestId: 'recurrence-list-keyword-filter',
    searchButtonTestId: 'recurrence-list-search-button',
  },
];

for (const scenario of scenarios) {
  test(`${scenario.name} applies drafts explicitly and keeps prior results stable`, async ({ page, request, e2eData }) => {
    await loginByApi(request);
    const room = await e2eData.createTestRoom(`${scenario.name.replaceAll(' ', '-')}-filters`);
    let listRequestCount = 0;
    let releaseEmptyResponse: (() => void) | undefined;
    let markEmptyRequestStarted: (() => void) | undefined;
    const emptyResponseGate = new Promise<void>((resolve) => { releaseEmptyResponse = resolve; });
    const emptyRequestStarted = new Promise<void>((resolve) => { markEmptyRequestStarted = resolve; });

    await page.route(`**${scenario.apiPath}?**`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      listRequestCount += 1;
      const url = new URL(route.request().url());
      if (url.searchParams.get('keyword') === 'testing-no-results') {
        markEmptyRequestStarted?.();
        await emptyResponseGate;
        await route.fulfill({ json: pagedResponse(scenario, room.id, room.name, 0, true) });
        return;
      }
      const pageNumber = Number(url.searchParams.get('page') || '0');
      await route.fulfill({ json: pagedResponse(scenario, room.id, room.name, pageNumber) });
    });

    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto(`${scenario.route}?keyword=testing-applied&page=0`);
    const results = page.getByTestId(scenario.resultsTestId);
    const table = page.getByTestId(scenario.tableTestId);
    const form = page.locator(`${scenario.route === '/admin/recurrences' ? '.recurrence-list-panel ' : ''}.filter-bar`);
    await expect(table).toBeVisible();
    await expect(results).toHaveAttribute('aria-busy', 'false');
    expect(listRequestCount).toBe(1);
    const rootMetricsBefore = await rootScrollMetrics(page);

    await page.getByTestId(scenario.roomFilterTestId).selectOption(room.id);
    await page.getByTestId(scenario.fromDateFilterTestId).fill('2026-09-01');
    await page.getByTestId(scenario.toDateFilterTestId).fill('2026-09-30');
    await page.getByTestId(scenario.keywordFilterTestId).fill('testing-draft');
    if (scenario.statusFilterTestId) {
      await page.getByTestId(scenario.statusFilterTestId).selectOption('CONFIRMED');
    }

    await page.waitForTimeout(100);
    expect(listRequestCount).toBe(1);
    expect(new URL(page.url()).searchParams.get('keyword')).toBe('testing-applied');
    expect(new URL(page.url()).searchParams.get('roomId')).toBeNull();

    if (scenario.route === '/admin/reservations') {
      let csvRequestUrl = '';
      await page.route('**/api/admin/exports/reservations.csv**', async (route) => {
        csvRequestUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: 'text/csv;charset=UTF-8',
          headers: { 'Content-Disposition': 'attachment; filename="reservations.csv"' },
          body: 'id\n',
        });
      }, { times: 1 });
      const downloadPromise = page.waitForEvent('download');
      await page.locator('.page-header').getByRole('button', { name: 'CSV 내보내기' }).click();
      await downloadPromise;
      const csvParams = new URL(csvRequestUrl).searchParams;
      expect(csvParams.get('keyword')).toBe('testing-applied');
      expect(csvParams.get('roomId')).toBeNull();

      await page.route('**/api/admin/exports/reservations.csv**', async (route) => {
        await route.fulfill({
          status: 422,
          json: {
            code: 'CSV_EXPORT_TOO_LARGE',
            message: 'Too many reservations to export. Narrow the filters and try again.',
          },
        });
      }, { times: 1 });
      await page.locator('.page-header button.secondary-button').click();
      await expect(page.getByRole('alert')).toContainText('검색 조건을 좁힌 뒤 다시 시도해 주세요.');
    }

    const submittedRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === scenario.apiPath && url.searchParams.get('keyword') === 'testing-draft';
    });
    await page.getByTestId(scenario.searchButtonTestId).click();
    const submittedUrl = new URL((await submittedRequest).url());
    expect(submittedUrl.searchParams.get('roomId')).toBe(room.id);
    expect(submittedUrl.searchParams.get('page')).toBe('0');
    expect(submittedUrl.searchParams.get('from') || submittedUrl.searchParams.get('fromDate')).toContain('2026-09-01');
    expect(submittedUrl.searchParams.get('to') || submittedUrl.searchParams.get('toDate')).toContain('2026-09-30');
    if (scenario.statusFilterTestId) expect(submittedUrl.searchParams.get('status')).toBe('CONFIRMED');
    await expect(results).toHaveAttribute('aria-busy', 'false');
    expect(listRequestCount).toBe(2);

    await page.getByTestId(scenario.keywordFilterTestId).fill('testing-forward');
    await page.getByTestId(scenario.keywordFilterTestId).press('Enter');
    await expect(page).toHaveURL(/keyword=testing-forward/);
    await expect(results).toHaveAttribute('aria-busy', 'false');
    expect(listRequestCount).toBe(3);

    await page.goBack();
    await expect(page.getByTestId(scenario.keywordFilterTestId)).toHaveValue('testing-draft');
    await expect(results).toHaveAttribute('aria-busy', 'false');
    await page.goForward();
    await expect(page.getByTestId(scenario.keywordFilterTestId)).toHaveValue('testing-forward');
    await expect(results).toHaveAttribute('aria-busy', 'false');

    await page.getByTestId(scenario.keywordFilterTestId).fill('testing-unapplied');
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page).toHaveURL(/page=1/);
    await expect(page.getByTestId(scenario.keywordFilterTestId)).toHaveValue('testing-unapplied');
    await expect(results).toHaveAttribute('aria-busy', 'false');

    const geometryBefore = await resultTransitionGeometry(page, form);
    await page.getByTestId(scenario.keywordFilterTestId).fill('testing-no-results');
    await page.getByTestId(scenario.searchButtonTestId).click();
    await emptyRequestStarted;
    await expect(results).toHaveAttribute('aria-busy', 'true');
    await expect(table).toBeVisible();
    await expect(results.locator('.pagination')).toBeVisible();
    await expect(results.getByText('불러오는 중입니다.')).toHaveCount(0);
    const geometryWhilePending = await resultTransitionGeometry(page, form);
    const pendingMaxDelta = expectGeometryStable(geometryBefore, geometryWhilePending);

    releaseEmptyResponse?.();
    await expect(results).toHaveAttribute('aria-busy', 'false');
    await expect(table).toBeHidden();
    await expect(results.getByText(scenario.route === '/admin/reservations'
      ? '조건에 맞는 예약이 없습니다.'
      : '조건에 맞는 반복 예약이 없습니다.')).toBeVisible();
    const geometryAfter = await resultTransitionGeometry(page, form);
    const settledMaxDelta = expectGeometryStable(geometryBefore, geometryAfter);
    const rootMetricsAfter = await rootScrollMetrics(page);
    if (scenario.route === '/admin/reservations') {
      expect(rootMetricsBefore.hasVerticalOverflow).toBe(true);
      expect(rootMetricsAfter.hasVerticalOverflow).toBe(false);
    }
    console.info(
      `${scenario.name} geometry: pending ${pendingMaxDelta}px, settled ${settledMaxDelta}px, `
      + `scrollbar ${rootMetricsBefore.scrollbarWidth}px, `
      + `overflow ${rootMetricsBefore.hasVerticalOverflow}->${rootMetricsAfter.hasVerticalOverflow}`,
    );
    await expect(page.locator('html')).toHaveCSS('scrollbar-gutter', /stable/);
  });

  test(`${scenario.name} ignores IME candidate Enter and submits completed Korean once`, async ({ page, request }) => {
    await loginByApi(request);
    let listRequestCount = 0;
    await page.route(`**${scenario.apiPath}?**`, async (route) => {
      if (route.request().method() === 'GET') listRequestCount += 1;
      await route.fulfill({ json: { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 } });
    });

    await page.goto(scenario.route);
    await expect(page.getByTestId(scenario.resultsTestId)).toHaveAttribute('aria-busy', 'false');
    expect(listRequestCount).toBe(1);
    const keywordInput = page.getByTestId(scenario.keywordFilterTestId);
    await dispatchKoreanCompositionEnter(keywordInput, '대학원');

    await page.waitForTimeout(100);
    await expect(keywordInput).toHaveValue('대학원');
    expect(listRequestCount).toBe(1);
    expect(new URL(page.url()).searchParams.get('keyword')).toBeNull();

    const completedRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === scenario.apiPath && url.searchParams.get('keyword') === '대학원';
    });
    await keywordInput.press('Enter');
    await completedRequest;
    await expect(page).toHaveURL(/keyword=%EB%8C%80%ED%95%99%EC%9B%90/);
    await expect(page.getByTestId(scenario.resultsTestId)).toHaveAttribute('aria-busy', 'false');
    expect(listRequestCount).toBe(2);
  });
}

test('reservation list keeps 12px between its table and result controls', async ({ page, request }) => {
  await loginByApi(request);
  let releaseSinglePageResponse: (() => void) | undefined;
  let markSinglePageRequestStarted: (() => void) | undefined;
  const singlePageResponseGate = new Promise<void>((resolve) => { releaseSinglePageResponse = resolve; });
  const singlePageRequestStarted = new Promise<void>((resolve) => { markSinglePageRequestStarted = resolve; });

  await page.route('**/api/admin/reservations?**', async (route) => {
    const url = new URL(route.request().url());
    const singlePage = url.searchParams.get('keyword') === 'testing-one-page';
    if (singlePage) {
      markSinglePageRequestStarted?.();
      await singlePageResponseGate;
    }
    await route.fulfill({
      json: {
        items: [reservationItem(singlePage ? 'one-page' : 'many-pages', 'testing-room-layout', '테스트 공간')],
        page: 0,
        size: 20,
        totalItems: singlePage ? 1 : 21,
        totalPages: singlePage ? 1 : 2,
      },
    });
  });

  await page.goto('/admin/reservations?keyword=testing-many-pages&page=0');
  const results = page.getByTestId('reservation-list-results');
  const tableWrap = results.locator(':scope > .table-wrap');
  await expect(tableWrap.getByRole('columnheader')).toHaveText([
    '예약 시간',
    '공간',
    '상태',
    '신청자',
    '목적',
    '신청 경로',
    '시간표',
  ]);
  const pagination = results.locator(':scope > .pagination');
  await expect(pagination).toBeVisible();
  await expectVerticalGap(tableWrap, pagination, 12);

  await page.getByTestId('reservation-keyword-filter').fill('testing-one-page');
  await page.getByTestId('reservation-search-button').click();
  await singlePageRequestStarted;
  await expect(results).toHaveAttribute('aria-busy', 'true');
  await expect(tableWrap).toBeVisible();
  await expect(pagination).toBeVisible();

  releaseSinglePageResponse?.();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  const resultSummary = results.locator(':scope > .result-summary');
  await expect(resultSummary).toBeVisible();
  await expectVerticalGap(tableWrap, resultSummary, 12);
});

test('administrator reservation and recurrence tables keep native cell geometry', async ({ page, request }) => {
  await loginByApi(request);
  const longRoomName = 'testing 아주 긴 공간 이름이 인접한 열을 침범하지 않아야 합니다';
  const longPurpose = 'testing 긴 예약 목적은 지정된 목적 열 안에서 자연스럽게 줄바꿈되고 뒤쪽 열을 밀어내지 않습니다.';

  await page.route('**/api/admin/reservations?**', (route) => route.fulfill({ json: {
    items: [{
      ...reservationItem('geometry', 'testing-room-geometry', longRoomName),
      applicantEmail: 'testing-applicant-with-a-long-address@example.invalid',
      purpose: longPurpose,
      startAt: '2026-09-14T13:00:00+09:00',
      endAt: '2026-09-14T20:00:00+09:00',
    }],
    page: 0,
    size: 20,
    totalItems: 1,
    totalPages: 1,
  } }));
  await page.route('**/api/admin/recurrences?**', (route) => route.fulfill({ json: {
    items: [{
      ...recurrenceItem('geometry', 'testing-room-geometry', longRoomName),
      purpose: longPurpose,
    }],
    page: 0,
    size: 20,
    totalItems: 1,
    totalPages: 1,
  } }));

  for (const width of [1920, 1440]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto('/admin/reservations');
    const table = page.getByTestId('reservations-table');
    await expect(table).toBeVisible();
    await expectTableUsesNativeCells(table);
    await expectTableFillsContainer(table);
    await expectWrapperHasNoOverflow(table);
    await expectAdjacentCellsDoNotOverlap(table);
    const timeStack = table.locator('tbody tr').first().locator('.table-cell-stack');
    await expect(timeStack).toContainText('2026. 9. 14. (월) 오후 1:00');
    await expect(timeStack).toContainText('~ 2026. 9. 14. (월) 오후 8:00');
    const roomCell = table.locator('tbody tr').first().locator('td').nth(1);
    const [timeBox, roomBox] = await Promise.all([timeStack.boundingBox(), roomCell.boundingBox()]);
    if (!timeBox || !roomBox) throw new Error('Could not measure reservation time and room cells.');
    expect(timeBox.x + timeBox.width).toBeLessThanOrEqual(roomBox.x + 1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/reservations');
  const mobileReservationTable = page.getByTestId('reservations-table');
  const mobileReservationWrapper = mobileReservationTable.locator('xpath=..');
  expect(await mobileReservationWrapper.evaluate((wrapper) => wrapper.scrollWidth > wrapper.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/admin/recurrences');
  const recurrenceTable = page.getByTestId('recurrences-table');
  await expect(recurrenceTable).toBeVisible();
  await expectTableUsesNativeCells(recurrenceTable);
  await expectTableFillsContainer(recurrenceTable);
  await expectWrapperHasNoOverflow(recurrenceTable);
  await expectAdjacentCellsDoNotOverlap(recurrenceTable);

  const recurrenceRow = recurrenceTable.locator('tbody tr').first();
  const initialBackground = await recurrenceRow.locator('td').first().evaluate((cell) => getComputedStyle(cell).backgroundColor);
  await recurrenceRow.hover();
  const hoverBackgrounds = await recurrenceRow.locator('td').evaluateAll((cells) =>
    cells.map((cell) => getComputedStyle(cell).backgroundColor),
  );
  expect(new Set(hoverBackgrounds).size).toBe(1);
  expect(hoverBackgrounds[0]).not.toBe(initialBackground);
  await page.mouse.move(0, 0);
  await recurrenceRow.focus();
  const focusBackgrounds = await recurrenceRow.locator('td').evaluateAll((cells) =>
    cells.map((cell) => getComputedStyle(cell).backgroundColor),
  );
  expect(new Set(focusBackgrounds).size).toBe(1);
  expect(focusBackgrounds[0]).not.toBe(initialBackground);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/recurrences');
  const mobileTable = page.getByTestId('recurrences-table');
  const mobileWrapper = mobileTable.locator('xpath=..');
  expect(await mobileWrapper.evaluate((wrapper) => wrapper.scrollWidth > wrapper.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('shared pagination keeps five-page desktop groups stable', async ({ page, request }) => {
  await loginByApi(request);
  await mockReservationPages(page, 43);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/reservations?page=0');

  const controls = page.locator('.pagination-desktop-controls');
  await expect(controls).toBeVisible();
  await expectPageNumbers(controls, [1, 2, 3, 4, 5, 43]);
  await expect(controls.locator('.page-ellipsis')).toHaveCount(1);
  const initialPositions = await pageNumberPositions(controls, [1, 2, 3, 4, 5]);

  await controls.getByRole('button', { name: '2', exact: true }).click();
  await expect(page).toHaveURL(/page=1/);
  await expectCurrentPage(controls, 2);
  await expectPageNumbers(controls, [1, 2, 3, 4, 5, 43]);
  expectPageNumberPositionsStable(initialPositions, await pageNumberPositions(controls, [1, 2, 3, 4, 5]));

  await controls.getByRole('button', { name: '3', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expectCurrentPage(controls, 3);
  await expectPageNumbers(controls, [1, 2, 3, 4, 5, 43]);
  expectPageNumberPositionsStable(initialPositions, await pageNumberPositions(controls, [1, 2, 3, 4, 5]));

  await controls.getByRole('button', { name: '5', exact: true }).click();
  await controls.getByRole('button', { name: '다음', exact: true }).click();
  await expectCurrentPage(controls, 6);
  await expectPageNumbers(controls, [1, 6, 7, 8, 9, 10, 43]);
  await expect(controls.locator('.page-ellipsis')).toHaveCount(2);

  await page.goto('/admin/reservations?page=35');
  await expectCurrentPage(controls, 36);
  await expectPageNumbers(controls, [1, 36, 37, 38, 39, 40, 43]);
  await expect(controls.locator('.page-ellipsis')).toHaveCount(2);

  await page.goto('/admin/reservations?page=40');
  await expectCurrentPage(controls, 41);
  await expectPageNumbers(controls, [1, 41, 42, 43]);
  await expect(controls.locator('.page-ellipsis')).toHaveCount(1);
});

test('shared pagination uses a stable two-row mobile layout', async ({ page, request }) => {
  await loginByApi(request);
  await mockReservationPages(page, 43);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/admin/reservations?page=0');

  const controls = page.locator('.pagination-mobile-controls');
  const first = controls.getByRole('button', { name: '첫 페이지' });
  const previous = controls.getByRole('button', { name: '이전 페이지' });
  const next = controls.getByRole('button', { name: '다음 페이지' });
  const last = controls.getByRole('button', { name: '마지막 페이지' });
  const position = controls.locator('.pagination-position');

  await expect(controls).toBeVisible();
  await expect(page.locator('.pagination-desktop-controls')).toBeHidden();
  await expect(first).toBeVisible();
  await expect(previous).toBeVisible();
  await expect(first).toBeDisabled();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(last).toBeEnabled();
  await expect(position).toHaveText('1/43');
  await expectMobilePaginationGeometry(controls, [first, previous, next, last], position);
  await expectPaginationContained(controls);

  await next.click();
  await expect(position).toHaveText('2/43');
  await expect(first).toBeEnabled();
  await expect(previous).toBeEnabled();
  await expectMobilePaginationGeometry(controls, [first, previous, next, last], position);

  await last.click();
  await expect(position).toHaveText('43/43');
  await expect(next).toBeDisabled();
  await expect(last).toBeDisabled();
  await expect(next).toBeVisible();
  await expect(last).toBeVisible();
  await expectPaginationContained(controls);
});

function pagedResponse(
  scenario: ListScenario,
  roomId: string,
  roomName: string,
  page: number,
  empty = false,
) {
  if (empty) return { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 };
  const itemCount = page === 0 ? 20 : 5;
  const items = Array.from({ length: itemCount }, (_, index) => (
    scenario.route === '/admin/reservations'
      ? reservationItem(`${page}-${index}`, roomId, roomName)
      : recurrenceItem(`${page}-${index}`, roomId, roomName)
  ));
  return { items, page, size: 20, totalItems: 25, totalPages: 2 };
}

function reservationItem(id: string, roomId: string, roomName: string) {
  return {
    id: `testing-reservation-list-${id}`,
    roomId,
    roomName,
    applicantName: '테스트 신청자',
    applicantEmail: null,
    applicantPhone: null,
    showApplicantName: false,
    purpose: `testing-reservation-list-${id}`,
    startAt: '2026-09-08T09:00:00+09:00',
    endAt: '2026-09-08T10:00:00+09:00',
    status: 'CONFIRMED',
    source: 'ADMIN',
    recurrenceId: null,
    seriesLabel: null,
    seriesColor: null,
    recurrenceException: false,
    createdAt: '2026-09-01T00:00:00Z',
  };
}

function recurrenceItem(id: string, roomId: string, roomName: string) {
  return {
    id: `testing-recurrence-list-${id}`,
    roomId,
    roomName,
    purpose: `testing-recurring-list-${id}`,
    tagId: null,
    tagName: null,
    tagColor: null,
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    daysOfWeek: 'TUE,THU',
    startTime: '09:00:00',
    endTime: '10:00:00',
    conflictPolicy: 'FAIL_ALL',
    showApplicantName: false,
    createdAt: '2026-09-01T00:00:00Z',
  };
}

async function expectTableUsesNativeCells(table: Locator) {
  const displays = await table.locator('tbody tr').first().locator('td').evaluateAll((cells) =>
    cells.map((cell) => getComputedStyle(cell).display),
  );
  expect(displays.every((display) => display === 'table-cell')).toBe(true);
}

async function expectTableFillsContainer(table: Locator) {
  const sizes = await table.locator('xpath=..').evaluate((wrapper) => ({
    wrapper: wrapper.getBoundingClientRect().width,
    container: wrapper.parentElement?.getBoundingClientRect().width ?? 0,
  }));
  expect(Math.abs(sizes.wrapper - sizes.container)).toBeLessThanOrEqual(1);
}

async function expectWrapperHasNoOverflow(table: Locator) {
  expect(await table.locator('xpath=..').evaluate((wrapper) => wrapper.scrollWidth <= wrapper.clientWidth + 1)).toBe(true);
}

async function expectAdjacentCellsDoNotOverlap(table: Locator) {
  const cells = await table.locator('tbody tr').first().locator('td').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    }),
  );
  cells.forEach((cell, index) => {
    expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth + 1);
    if (index < cells.length - 1) expect(cell.right).toBeLessThanOrEqual(cells[index + 1].left + 1);
  });
}

async function dispatchKoreanCompositionEnter(input: Locator, value: string) {
  await input.evaluate((element, nextValue) => {
    const inputElement = element as HTMLInputElement;
    inputElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(inputElement, nextValue);
    inputElement.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: nextValue,
      inputType: 'insertCompositionText',
      isComposing: true,
    }));
    inputElement.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      code: 'Enter',
      isComposing: true,
    }));
    inputElement.form?.requestSubmit();
    inputElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: nextValue }));
  }, value);
}

async function resultTransitionGeometry(page: Page, form: Locator) {
  const [header, filter, searchButton] = await Promise.all([
    page.locator('.page-header').first().boundingBox(),
    form.boundingBox(),
    form.getByRole('button', { name: '조회', exact: true }).boundingBox(),
  ]);
  if (!header || !filter || !searchButton) throw new Error('Could not measure list result transition geometry.');
  return {
    headerX: header.x,
    headerRight: header.x + header.width,
    filterX: filter.x,
    filterRight: filter.x + filter.width,
    searchButtonX: searchButton.x,
  };
}

function expectGeometryStable(
  before: Awaited<ReturnType<typeof resultTransitionGeometry>>,
  after: Awaited<ReturnType<typeof resultTransitionGeometry>>,
) {
  let maxDelta = 0;
  for (const key of Object.keys(before) as Array<keyof typeof before>) {
    const delta = Math.abs(before[key] - after[key]);
    maxDelta = Math.max(maxDelta, delta);
    expect(delta, `${key} should remain stable`).toBeLessThanOrEqual(1);
  }
  return maxDelta;
}

async function rootScrollMetrics(page: Page) {
  return page.evaluate(() => ({
    hasVerticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
  }));
}

async function expectVerticalGap(first: Locator, second: Locator, expectedGap: number) {
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  if (!firstBox || !secondBox) throw new Error('Could not measure reservation result spacing.');
  expect(
    Math.abs(secondBox.y - (firstBox.y + firstBox.height) - expectedGap),
    `expected ${expectedGap}px vertical gap`,
  ).toBeLessThanOrEqual(1);
}

async function mockReservationPages(page: Page, totalPages: number) {
  await page.route('**/api/admin/reservations?**', async (route) => {
    const requestedPage = Number(new URL(route.request().url()).searchParams.get('page') || '0');
    await route.fulfill({
      json: {
        items: [reservationItem(`pagination-${requestedPage}`, 'testing-room-pagination', '테스트 공간')],
        page: requestedPage,
        size: 20,
        totalItems: totalPages * 20,
        totalPages,
      },
    });
  });
}

async function expectPageNumbers(controls: Locator, expected: number[]) {
  await expect.poll(async () => controls.locator('.page-button').allTextContents())
    .toEqual(expected.map(String));
}

async function expectCurrentPage(controls: Locator, pageNumber: number) {
  await expect(controls.locator('.page-button[aria-current="page"]')).toHaveCount(1);
  await expect(controls.locator('.page-button[aria-current="page"]')).toHaveText(String(pageNumber));
  await expect(controls.locator('.page-button[aria-current="page"]')).toHaveCSS('opacity', '1');
}

async function pageNumberPositions(controls: Locator, pageNumbers: number[]) {
  return Promise.all(pageNumbers.map(async (pageNumber) => {
    const box = await controls.getByRole('button', { name: String(pageNumber), exact: true }).boundingBox();
    if (!box) throw new Error(`Could not measure page ${pageNumber}.`);
    return box.x;
  }));
}

function expectPageNumberPositionsStable(before: number[], after: number[]) {
  before.forEach((x, index) => {
    expect(Math.abs(x - after[index]), `page ${index + 1} X position should remain stable`)
      .toBeLessThanOrEqual(1);
  });
}

async function expectMobilePaginationGeometry(
  controls: Locator,
  buttons: [Locator, Locator, Locator, Locator],
  position: Locator,
) {
  const [firstBox, previousBox, nextBox, lastBox, positionBox, controlsBox] = await Promise.all([
    buttons[0].boundingBox(),
    buttons[1].boundingBox(),
    buttons[2].boundingBox(),
    buttons[3].boundingBox(),
    position.boundingBox(),
    controls.boundingBox(),
  ]);
  if (!firstBox || !previousBox || !nextBox || !lastBox || !positionBox || !controlsBox) {
    throw new Error('Could not measure mobile pagination geometry.');
  }

  const boxes = [firstBox, previousBox, nextBox, lastBox];
  boxes.forEach((box) => expect(box.height).toBeGreaterThanOrEqual(44));
  boxes.slice(1).forEach((box) => expect(Math.abs(box.width - firstBox.width)).toBeLessThanOrEqual(1));
  expect(Math.abs((firstBox.x + firstBox.width / 2) - (previousBox.x + previousBox.width / 2)))
    .toBeLessThanOrEqual(1);
  expect(Math.abs((lastBox.x + lastBox.width / 2) - (nextBox.x + nextBox.width / 2)))
    .toBeLessThanOrEqual(1);
  expect(Math.abs((positionBox.x + positionBox.width / 2) - (controlsBox.x + controlsBox.width / 2)))
    .toBeLessThanOrEqual(1);
  expect(previousBox.y).toBeGreaterThan(firstBox.y);
  expect(nextBox.y).toBeGreaterThan(lastBox.y);
}

async function expectPaginationContained(controls: Locator) {
  const metrics = await controls.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const buttons = Array.from(element.querySelectorAll('button'));
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      overflow: element.scrollWidth - element.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      buttonsFit: buttons.every((button) => button.scrollWidth <= button.clientWidth),
      buttonsDoNotWrap: buttons.every((button) => getComputedStyle(button).whiteSpace === 'nowrap'),
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
  expect(metrics.buttonsFit).toBe(true);
  expect(metrics.buttonsDoNotWrap).toBe(true);
}
