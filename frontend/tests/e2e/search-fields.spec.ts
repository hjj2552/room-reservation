import { expect, test } from './fixtures';

const scenarios = [
  { path: 'reservations', api: 'reservations', input: 'reservation-keyword-filter', button: 'reservation-search-button', menu: '예약 목록', fields: ['purpose', 'applicantName'], labels: ['신청 목적', '신청자 이름'], optionCount: 6 },
  { path: 'recurrences', api: 'recurrences', input: 'recurrence-list-keyword-filter', button: 'recurrence-list-search-button', menu: '반복 예약', fields: ['purpose', 'applicantName'], labels: ['신청 목적', '신청자 이름'], optionCount: 5 },
  { path: 'audit', api: 'audit/reservation-histories', input: 'audit-keyword-input', button: 'audit-search-button', menu: '감사 이력', fields: ['purpose', 'applicantName'], labels: ['신청 목적', '신청자 이름'], optionCount: 8 },
  { path: 'rooms', api: 'rooms', input: 'room-keyword-input', button: 'room-search-button', menu: '공간 관리', fields: ['name', 'location'], labels: ['공간명', '위치'], optionCount: 4 },
];

// Synthetic responses exercise URL/cache/UI behavior; PostgreSQL tests cover actual search matching.
function itemFor(path: string, field: string) {
  const label = `testing-result-${field}`;
  const dateTime = '2026-11-02T10:00:00+09:00';
  const common = { id: '11111111-1111-4111-8111-111111111111', roomId: '22222222-2222-4222-8222-222222222222', roomName: 'testing-room', purpose: label, createdAt: dateTime };
  if (path === 'rooms') return { ...common, name: label, location: 'testing-location', capacity: 10, enabled: true, updatedAt: dateTime };
  if (path === 'recurrences') return { ...common, startDate: '2026-11-02', endDate: '2026-11-09', daysOfWeek: 'MON', startTime: '10:00', endTime: '11:00', conflictPolicy: 'FAIL_ALL' };
  if (path === 'audit') return { ...common, reservationId: common.id, action: 'UPDATED', beforeStatus: 'REQUESTED', afterStatus: 'REQUESTED', reservationRoomName: 'testing-room', reservationStartAt: dateTime, reservationEndAt: '2026-11-02T11:00:00+09:00', actorType: 'ADMIN', actorId: label, memo: 'testing-memo' };
  return { ...common, applicantName: 'testing-applicant', startAt: dateTime, endAt: '2026-11-02T11:00:00+09:00', status: 'REQUESTED', source: 'ADMIN_MANUAL' };
}

for (const scenario of scenarios) {
  test(`${scenario.path} keeps search field, keyword and navigation together`, async ({ page }, testInfo) => {
    const requests: URL[] = [];
    await page.route(`**/api/admin/${scenario.api}?**`, async (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      const searchField = url.searchParams.get('searchField') || 'all';
      await route.fulfill({ json: {
        items: [itemFor(scenario.path, searchField)],
        page: Number(url.searchParams.get('page') || '0'), size: 20, totalItems: 41, totalPages: 3,
      } });
    });
    const target = page.getByRole('combobox', { name: '검색 대상', exact: true });
    const input = page.getByTestId(scenario.input);
    const submit = page.getByTestId(scenario.button);
    await page.goto(`/admin/${scenario.path}?keyword=testing-shared&page=1`);
    await expect(target).toHaveValue('all');
    await expect(target.locator('option')).toHaveCount(scenario.optionCount);
    await expect(page.getByText('testing-result-all', { exact: true })).toBeVisible();
    const initialCount = requests.length;

    await target.focus();
    await target.press('Home');
    await target.press('ArrowDown');
    await target.press('Tab');
    await expect(input).toBeFocused();
    await expect(target).toHaveValue(scenario.fields[0]);
    await expect(input).toHaveAttribute('aria-label', `${scenario.labels[0]} 검색어`);
    await expect(input).toHaveAttribute('placeholder', `${scenario.labels[0]} 입력`);
    await input.fill('  testing-shared  ');
    expect(requests.length).toBe(initialCount);
    const applied = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === `/api/admin/${scenario.api}` && url.searchParams.get('searchField') === scenario.fields[0];
    });
    await submit.click();
    await applied;
    await expect(page.getByText(`testing-result-${scenario.fields[0]}`, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(url => url.searchParams.get('page') === '0' && url.searchParams.get('keyword') === 'testing-shared' && url.searchParams.get('searchField') === scenario.fields[0]);
    expect(requests.at(-1)?.searchParams.get('page')).toBe('0');

    if (scenario.path === 'reservations' || scenario.path === 'recurrences') {
      const item = itemFor(scenario.path, scenario.fields[0]);
      await page.route(`**/api/admin/${scenario.api}/${item.id}`, route => route.fulfill({ json: {
        ...item, room: { id: item.roomId, name: item.roomName, enabled: true }, reservations: [],
        applicantName: 'testing-applicant', applicantEmail: null, applicantPhone: null,
      } }));
      await page.route(`**/api/admin/reservations/${item.id}/histories`, route => route.fulfill({ json: [] }));
      await page.locator('table tbody tr').first().click();
      await expect(page).toHaveURL(url => url.pathname.endsWith(`/${item.id}`));
      if (scenario.path === 'recurrences') {
        await page.getByRole('button', { name: '목록으로', exact: true }).click();
      } else {
        await page.goBack();
      }
      await expect(target).toHaveValue(scenario.fields[0]);
      await expect(input).toHaveValue('testing-shared');
    }

    await target.selectOption(scenario.fields[1]);
    await input.press('Enter');
    await expect(page.getByText(`testing-result-${scenario.fields[1]}`, { exact: true })).toBeVisible();
    await input.fill('testing-unapplied-history');
    await target.selectOption('all');
    await page.goBack();
    await expect(target).toHaveValue(scenario.fields[0]);
    await expect(input).toHaveValue('testing-shared');
    await expect(page.getByText(`testing-result-${scenario.fields[0]}`, { exact: true })).toBeVisible();
    await page.goForward();
    await expect(target).toHaveValue(scenario.fields[1]);
    await expect(page.getByText(`testing-result-${scenario.fields[1]}`, { exact: true })).toBeVisible();
    await page.reload();
    await expect(target).toHaveValue(scenario.fields[1]);
    await expect(input).toHaveValue('testing-shared');

    // Existing menu/session restoration must retain only applied values.
    await input.fill('testing-unapplied');
    await target.selectOption('all');
    await page.getByRole('link', { name: '운영 설정', exact: true }).click();
    await expect(page.getByRole('heading', { name: '운영 설정', exact: true })).toBeVisible();
    await page.getByRole('link', { name: scenario.menu, exact: true }).click();
    await expect(target).toHaveValue(scenario.fields[1]);
    await expect(input).toHaveValue('testing-shared');

    if (scenario.path === 'reservations') {
      await page.route('**/api/admin/exports/reservations.csv?**', route => route.fulfill({
        contentType: 'text/csv', body: '\uFEFFid\r\n',
      }));
      const csv = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/reservations.csv'));
      await page.getByRole('button', { name: 'CSV 내보내기' }).click();
      const params = new URL((await csv).url()).searchParams;
      expect(params.get('searchField')).toBe(scenario.fields[1]);
      expect(params.get('keyword')).toBe('testing-shared');
    }

    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const searchControls = input.locator('xpath=../..');
      await searchControls.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await searchControls.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(target).toBeVisible();
      await expect(input).toBeVisible();
      if (width !== 1024) await page.screenshot({ path: testInfo.outputPath(`${scenario.path}-${width}.png`), fullPage: true });
    }

    if (scenario.path === 'rooms') {
      await page.getByTestId('room-search-reset').click();
      await expect(target).toHaveValue('all');
      await expect(input).toHaveValue('');
      await expect(page).toHaveURL(url => url.searchParams.get('page') === '0' && !url.searchParams.has('keyword'));
    }
    await page.goto(`/admin/${scenario.path}?searchField=unsupported&keyword=testing-invalid`);
    await expect(target).toHaveValue('all');
    await expect(page.getByText('testing-result-all', { exact: true })).toBeVisible();
    expect(requests.at(-1)?.searchParams.get('searchField')).toBe('all');
  });
}

test('a late response for the previous search field cannot replace the current results', async ({ page }) => {
  let release: () => void = () => {};
  let started: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/admin/reservations?**', async route => {
    const field = new URL(route.request().url()).searchParams.get('searchField') || 'all';
    if (field === 'purpose') {
      started();
      await gate;
    }
    await route.fulfill({ json: { items: [itemFor('reservations', field)], page: 0, size: 20, totalItems: 1, totalPages: 1 } });
  });
  try {
    await page.goto('/admin/reservations?keyword=testing-shared&searchField=purpose');
    await pending;
    await page.getByRole('combobox', { name: '검색 대상', exact: true }).selectOption('applicantName');
    await page.getByTestId('reservation-search-button').click();
    await expect(page.getByText('testing-result-applicantName', { exact: true })).toBeVisible();
    const oldResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('searchField') === 'purpose');
    release();
    await oldResponse;
    await expect(page.getByTestId('reservation-list-results')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByText('testing-result-applicantName', { exact: true })).toBeVisible();
    await expect(page.getByText('testing-result-purpose', { exact: true })).toHaveCount(0);
  } finally {
    release();
  }
});
