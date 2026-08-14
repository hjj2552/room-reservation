import type { Page } from '@playwright/test';
import { parsePageParam } from '../../shared/utils/page';
import { expect, test } from './fixtures';

interface ListScenario {
  name: string;
  route: string;
  apiPath: string;
  item: (label: string) => Record<string, unknown>;
}

const timestamp = '2026-08-14T10:00:00+09:00';

const scenarios: ListScenario[] = [
  {
    name: 'reservation list',
    route: '/admin/reservations',
    apiPath: '/api/admin/reservations',
    item: reservationItem,
  },
  {
    name: 'recurrence list',
    route: '/admin/recurrences',
    apiPath: '/api/admin/recurrences',
    item: (label) => ({
      id: '20000000-0000-4000-8000-000000000001',
      roomId: '10000000-0000-4000-8000-000000000001',
      roomName: 'testing-room-pagination',
      purpose: label,
      tagId: null,
      tagName: null,
      tagColor: null,
      startDate: '2026-08-17',
      endDate: '2026-08-17',
      daysOfWeek: 'MON',
      startTime: '10:00:00',
      endTime: '11:00:00',
      conflictPolicy: 'FAIL_ALL',
      showApplicantName: false,
      createdAt: timestamp,
    }),
  },
  {
    name: 'room list',
    route: '/admin/rooms',
    apiPath: '/api/admin/rooms',
    item: (label) => ({
      id: '30000000-0000-4000-8000-000000000001',
      name: label,
      location: null,
      capacity: 10,
      description: null,
      enabled: true,
      displayOrder: 0,
      deleted: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    }),
  },
  {
    name: 'tag list',
    route: '/admin/settings/tags',
    apiPath: '/api/admin/tags',
    item: (label) => ({
      id: '40000000-0000-4000-8000-000000000001',
      name: label,
      color: '#2563eb',
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  },
  {
    name: 'audit list',
    route: '/admin/audit',
    apiPath: '/api/admin/audit/reservation-histories',
    item: (label) => ({
      id: '50000000-0000-4000-8000-000000000001',
      reservationId: '60000000-0000-4000-8000-000000000001',
      action: 'UPDATED',
      beforeStatus: 'REQUESTED',
      afterStatus: 'REQUESTED',
      memo: label,
      reservationRoomId: null,
      reservationPurpose: label,
      reservationRoomName: 'testing-room-pagination',
      reservationStartAt: timestamp,
      reservationEndAt: '2026-08-14T11:00:00+09:00',
      actorType: 'ADMIN',
      actorId: 'admin',
      createdAt: timestamp,
    }),
  },
];

test('page parameter parser accepts only non-negative safe integers', () => {
  expect([
    parsePageParam('0.5'),
    parsePageParam('-1'),
    parsePageParam('abc'),
    parsePageParam('Infinity'),
    parsePageParam('9007199254740992'),
  ]).toEqual([0, 0, 0, 0, 0]);
  expect(parsePageParam('2')).toBe(2);
});

test('invalid reservation page values request page zero and normalize the URL', async ({ page }) => {
  const requestedPages: string[] = [];
  await page.route('**/api/admin/reservations?**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const requestedPage = requestUrl.searchParams.get('page') || '0';
    requestedPages.push(requestedPage);
    const pageNumber = Number(requestedPage);
    await route.fulfill({
      json: pagedResponse(
        pageNumber,
        3,
        [reservationItem(`testing-reservation-page-${pageNumber}`)],
      ),
    });
  });

  for (const value of ['0.5', '-1', 'abc', 'Infinity', '9007199254740992']) {
    await page.goto(`/admin/reservations?page=${encodeURIComponent(value)}`);
    await expect(page).toHaveURL(/page=0(?:&|$)/);
    await expect(page.getByTestId('reservations-table')).toBeVisible();
    expect(requestedPages.at(-1)).toBe('0');
  }

  await page.goto('/admin/reservations?page=2');
  await expect(page).toHaveURL(/page=2(?:&|$)/);
  await expect(page.getByText('testing-reservation-page-2')).toBeVisible();
  expect(requestedPages.at(-1)).toBe('2');
});

for (const scenario of scenarios) {
  test(`${scenario.name} replaces out-of-range and empty result pages`, async ({ page }) => {
    const requests: Array<{ page: number; empty: boolean }> = [];
    await mockPagedList(page, scenario, requests);

    await page.goto(`${scenario.route}?page=0&history=base`);
    await expect(page.getByText(`testing-${scenario.name}-first-page`)).toBeVisible();

    await page.goto(`${scenario.route}?page=99`);
    await expect(page).toHaveURL(/page=2(?:&|$)/);
    await expect(page.getByText(`testing-${scenario.name}-last-page`)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/page=0.*history=base|history=base.*page=0/);

    await page.goto(`${scenario.route}?page=99&empty=true`);
    await expect(page).toHaveURL(/page=0.*empty=true|empty=true.*page=0/);
    await page.waitForTimeout(100);
    expect(requests.slice(-2)).toEqual([
      { page: 99, empty: true },
      { page: 0, empty: true },
    ]);
  });
}

test('reservation placeholder data does not undo a valid next-page navigation', async ({ page }) => {
  let releaseSecondPage!: () => void;
  let markSecondPageStarted!: () => void;
  const secondPageGate = new Promise<void>((resolve) => { releaseSecondPage = resolve; });
  const secondPageStarted = new Promise<void>((resolve) => { markSecondPageStarted = resolve; });

  await page.route('**/api/admin/reservations?**', async (route) => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page') || '0');
    if (pageNumber === 1) {
      markSecondPageStarted();
      await secondPageGate;
    }
    await route.fulfill({
      json: pagedResponse(
        pageNumber,
        2,
        [reservationItem(pageNumber === 0 ? 'testing-placeholder-first' : 'testing-placeholder-second')],
      ),
    });
  });

  await page.goto('/admin/reservations?page=0');
  await expect(page.getByText('testing-placeholder-first')).toBeVisible();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await secondPageStarted;
  await expect(page).toHaveURL(/page=1(?:&|$)/);
  await expect(page.getByText('testing-placeholder-first')).toBeVisible();
  await page.waitForTimeout(100);
  await expect(page).toHaveURL(/page=1(?:&|$)/);

  releaseSecondPage();
  await expect(page.getByText('testing-placeholder-second')).toBeVisible();
  await expect(page).toHaveURL(/page=1(?:&|$)/);
});

async function mockPagedList(
  page: Page,
  scenario: ListScenario,
  requests: Array<{ page: number; empty: boolean }>,
) {
  await page.route(`**${scenario.apiPath}?**`, async (route) => {
    const requestUrl = new URL(route.request().url());
    const pageNumber = Number(requestUrl.searchParams.get('page') || '0');
    const empty = new URL(page.url()).searchParams.get('empty') === 'true';
    requests.push({ page: pageNumber, empty });
    const inRange = pageNumber < 3;
    const label = pageNumber === 2 ? 'last-page' : 'first-page';
    await route.fulfill({
      json: pagedResponse(
        pageNumber,
        empty ? 0 : 3,
        empty || !inRange ? [] : [scenario.item(`testing-${scenario.name}-${label}`)],
      ),
    });
  });
}

function pagedResponse(page: number, totalPages: number, items: Array<Record<string, unknown>>) {
  return {
    items,
    page,
    size: 20,
    totalItems: totalPages === 0 ? 0 : 41,
    totalPages,
  };
}

function reservationItem(label: string) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    roomId: '10000000-0000-4000-8000-000000000002',
    roomName: 'testing-room-pagination',
    applicantName: 'testing-applicant-pagination',
    applicantEmail: 'testing-pagination@example.invalid',
    applicantPhone: null,
    showApplicantName: false,
    purpose: label,
    startAt: timestamp,
    endAt: '2026-08-14T11:00:00+09:00',
    status: 'REQUESTED',
    source: 'ADMIN_MANUAL',
    recurrenceId: null,
    seriesLabel: null,
    seriesColor: null,
    recurrenceException: false,
    createdAt: timestamp,
  };
}
