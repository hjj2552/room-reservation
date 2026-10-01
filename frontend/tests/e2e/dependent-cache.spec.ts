import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { getSettingsByApi, updateSettingsByApi } from './helpers';

// Use the app's router so public/admin navigation keeps the same QueryClient.
async function navigate(page: Page, path: string) {
  await page.evaluate(async nextPath => {
    const modulePath = '/routes/router.tsx';
    const { router } = await import(modulePath);
    await router.navigate(nextPath);
  }, path);
  await expect(page).toHaveURL(path);
}

function trackReads(page: Page) {
  const paths: string[] = [];
  page.on('request', request => {
    if (request.method() === 'GET') paths.push(new URL(request.url()).pathname);
  });
  return (path: string) => paths.filter(value => value === path).length;
}

async function renameRoom(page: Page, oldName: string, newName: string) {
  await navigate(page, '/admin/rooms');
  await page.getByTestId('rooms-table').locator('tbody tr').filter({ hasText: oldName }).getByTestId('room-edit-button').click();
  await page.getByTestId('room-name-input').fill(newName);
  await page.getByTestId('room-location-input').fill('testing-new-location');
  await page.getByTestId('room-save-button').click();
  await expect(page.getByTestId('room-form')).toHaveCount(0);
}

test('room edits and deletion refresh cached reservation and recurrence references without refreshing histories', async ({ page, e2eData }) => {
  test.setTimeout(120_000);
  const room = await e2eData.createTestRoom('cache-reference', { location: 'testing-old-location' });
  const reservation = await e2eData.createTestReservation(room.id, 'cache-reference');
  const recurrence = await e2eData.createTestRecurringReservation(room.id, 'cache-reference', { startTime: '14:00', endTime: '15:00' });
  const date = reservation.startAt.slice(0, 10);
  const cases = [
    { url: '/admin/reservations', api: '/api/admin/reservations' },
    { url: `/admin/reservations/${reservation.id}`, api: `/api/admin/reservations/${reservation.id}` },
    { url: `/admin/timetable?view=date&date=${date}`, api: '/api/admin/timetable/reservations' },
    { url: '/admin/recurrences', api: '/api/admin/recurrences' },
    { url: `/admin/recurrences/${recurrence.recurrenceId}`, api: `/api/admin/recurrences/${recurrence.recurrenceId}` },
    { url: `/timetable?view=date&date=${date}`, api: '/api/public/rooms' },
    { url: `/reservations/${reservation.id}`, api: `/api/public/reservations/${reservation.id}` },
  ];
  await page.clock.setFixedTime(new Date()); // The 30-second staleTime never naturally expires.
  const reads = trackReads(page);
  await page.goto('/admin/rooms');
  await navigate(page, '/admin/audit');
  await expect(page.getByTestId('audit-table')).toBeVisible();
  const auditReads = reads('/api/admin/audit/reservation-histories');
  for (const item of cases) {
    const loaded = page.waitForResponse(value => value.request().method() === 'GET'
      && new URL(value.url()).pathname === item.api && !new URL(value.url()).searchParams.has('status'));
    await navigate(page, item.url);
    await (await loaded).finished();
    await expect(page.locator('body')).toContainText(room.name);
    if (item.url === `/admin/reservations/${reservation.id}`) {
      await expect.poll(() => reads(`/api/admin/reservations/${reservation.id}/histories`)).toBeGreaterThan(0);
    }
  }
  const historyPath = `/api/admin/reservations/${reservation.id}/histories`;
  const historyReads = reads(historyPath);
  expect(historyReads).toBeGreaterThan(0);
  const publicReads = reads(`/api/public/reservations/${reservation.id}`);
  const publicWeeklyPath = `/api/public/rooms/${room.id}/weekly-reservations`;
  const weeklyReads = reads(publicWeeklyPath);
  const newName = e2eData.name('room-cache-renamed');
  await renameRoom(page, room.name, newName);
  expect(reads(`/api/public/reservations/${reservation.id}`)).toBe(publicReads);
  expect(reads(publicWeeklyPath)).toBe(weeklyReads); // Inactive caches wait until revisited.
  for (const item of cases) {
    const before = reads(item.api);
    await navigate(page, item.url);
    await expect(page.locator('body')).toContainText(newName);
    await expect.poll(() => reads(item.api)).toBeGreaterThan(before);
  }
  expect(reads(historyPath)).toBe(historyReads);
  await navigate(page, '/admin/audit');
  await expect(page.getByTestId('audit-table')).toBeVisible();
  expect(reads('/api/admin/audit/reservation-histories')).toBe(auditReads);
  await navigate(page, `/reservations/${reservation.id}`);
  await expect(page.locator('.public-site')).toBeVisible();
  expect(reads(publicWeeklyPath)).toBeGreaterThan(weeklyReads);
  // Masked public fields still come from the public API, never from admin cache data.
  await expect(page.locator('body')).not.toContainText('testing-admin');

  await navigate(page, '/admin/rooms');
  await page.getByTestId('rooms-table').locator('tbody tr').filter({ hasText: newName }).getByTestId('room-delete-button').click();
  await page.getByTestId('room-delete-confirm-input').fill(newName);
  await page.getByTestId('room-delete-confirm-button').click();
  await expect(page.getByTestId('room-delete-confirm-button')).toHaveCount(0);
  for (const item of cases.filter(item => item.url !== `/timetable?view=date&date=${date}`)) {
    const response = page.waitForResponse(value => value.request().method() === 'GET'
      && new URL(value.url()).pathname === item.api && value.ok()
      && !new URL(value.url()).searchParams.has('status'));
    await navigate(page, item.url);
    const data = await (await response).json();
    const entry = Array.isArray(data) ? data.find(row => row.id === reservation.id)
      : data.items ? data.items.find((row: { id: string }) => row.id === (item.api.includes('recurrences') ? recurrence.recurrenceId : reservation.id)) : data;
    expect(entry.room?.id || entry.roomId).not.toBe(room.id);
    expect(entry.room?.name || entry.roomName).toBe(newName);
  }
  await navigate(page, `/timetable?view=date&date=${date}`);
  await expect(page.getByTestId('reservation-timetable-block')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(newName);
  expect(reads(historyPath)).toBe(historyReads);
});

test('public room choices refresh after create, disable, enable and order changes', async ({ page, e2eData }) => {
  const first = await e2eData.createTestRoom('cache-order-first');
  const second = await e2eData.createTestRoom('cache-order-second');
  await page.clock.setFixedTime(new Date());
  const reads = trackReads(page);
  await page.goto('/timetable?view=room');
  const choices = page.getByTestId('public-timetable-room-select');
  await expect(choices).toContainText(first.name);
  const publicCount = reads('/api/public/rooms');
  await navigate(page, '/admin/rooms');
  await page.getByTestId('room-create-button').click();
  const newName = e2eData.name('room-cache-created');
  await page.getByTestId('room-name-input').fill(newName);
  await page.getByTestId('room-capacity-input').fill('10');
  const created = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/admin/rooms');
  await page.getByTestId('room-save-button').click();
  const newRoom = await (await created).json();
  e2eData.registerRoom(newRoom.id);
  await expect(page.getByTestId('room-form')).toHaveCount(0);
  expect(reads('/api/public/rooms')).toBe(publicCount);
  await navigate(page, '/timetable?view=room');
  await expect(choices).toContainText(newName);
  const weeklyPath = `/api/public/rooms/${first.id}/weekly-reservations`;
  for (const enabled of [false, true]) {
    const previousWeeklyReads = reads(weeklyPath);
    await navigate(page, '/admin/rooms');
    const response = page.waitForResponse(value => value.request().method() === 'PATCH' && value.url().includes(`/rooms/${first.id}/enabled`));
    await page.getByTestId('rooms-table').locator('tbody tr').filter({ hasText: first.name }).getByTestId('room-enabled-toggle').click();
    expect((await response).ok()).toBe(true);
    await navigate(page, `/timetable?view=room&roomViewRoomId=${first.id}`);
    if (enabled) {
      await expect(choices).toContainText(first.name);
      await expect.poll(() => reads(weeklyPath)).toBeGreaterThan(previousWeeklyReads);
    } else await expect(choices).not.toContainText(first.name);
  }
  const secondWeeklyPath = `/api/public/rooms/${second.id}/weekly-reservations`;
  const secondWeeklyReads = reads(secondWeeklyPath);
  await navigate(page, '/admin/rooms');
  await page.getByTestId('room-order-button').click();
  const handle = page.getByTestId('room-order-item').filter({ hasText: second.name }).getByTestId('room-order-handle');
  await handle.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await page.getByTestId('room-order-save').click();
  await expect(page.getByTestId('room-order-save')).toHaveCount(0);
  await navigate(page, '/timetable?view=room');
  await expect.poll(() => choices.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)))
    .toEqual([second.id, first.id, newRoom.id]);
  expect(reads(secondWeeklyPath)).toBe(secondWeeklyReads);
});

test('settings refresh public settings without refetching unrelated room or reservation data or clearing an open request', async ({ page, request, e2eData }) => {
  const original = await getSettingsByApi(request);
  const room = await e2eData.createTestRoom('cache-settings');
  await page.clock.setFixedTime(new Date());
  const reads = trackReads(page);
  await page.goto('/timetable');
  await expect(page.getByTestId('public-new-request-button')).toBeVisible();
  const roomReads = reads('/api/public/rooms');
  const weeklyPath = `/api/public/rooms/${room.id}/weekly-reservations`;
  await expect.poll(() => reads(weeklyPath)).toBeGreaterThan(0);
  const weeklyReads = reads(weeklyPath);
  try {
    await navigate(page, '/admin/settings');
    const notice = e2eData.name('notice-cache-updated');
    await page.getByTestId('settings-public-notice-input').fill(notice);
    const saved = page.waitForResponse(value => value.request().method() === 'PUT' && value.url().includes('/api/admin/settings'));
    await page.getByTestId('settings-save-button').click();
    expect((await saved).ok()).toBe(true);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/public/settings', async route => { await gate; await route.continue(); });
    const refreshed = page.waitForResponse(value => new URL(value.url()).pathname === '/api/public/settings');
    await navigate(page, '/timetable');
    await page.getByTestId('public-new-request-button').click();
    await page.getByTestId('public-request-purpose-input').fill('testing-in-progress-purpose');
    release();
    await (await refreshed).finished();
    await expect(page.getByText(notice, { exact: true })).toBeVisible();
    await expect(page.getByTestId('public-request-purpose-input')).toHaveValue('testing-in-progress-purpose');
    expect(reads('/api/public/rooms')).toBe(roomReads);
    expect(reads(weeklyPath)).toBe(weeklyReads);
  } finally {
    const latest = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...original, version: latest.version });
  }
});

test('failed room and settings changes keep fresh dependent caches and current inputs', async ({ page, e2eData }) => {
  const room = await e2eData.createTestRoom('cache-failure');
  await page.clock.setFixedTime(new Date());
  const reads = trackReads(page);
  await page.goto('/timetable');
  await expect(page.locator('body')).toContainText(room.name);
  const roomReads = reads('/api/public/rooms');
  const settingsReads = reads('/api/public/settings');
  await navigate(page, '/admin/rooms');
  await page.route(`**/api/admin/rooms/${room.id}`, route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, json: { message: 'testing-failure' } }) : route.continue());
  await page.getByTestId('room-edit-button').click();
  await page.getByTestId('room-name-input').fill('testing-unsaved-room');
  await page.getByTestId('room-save-button').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('room-name-input')).toHaveValue('testing-unsaved-room');
  await navigate(page, '/admin/settings');
  await page.route('**/api/admin/settings', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, json: { message: 'testing-failure' } }) : route.continue());
  await page.getByTestId('settings-public-notice-input').fill('testing-unsaved-notice');
  await page.getByTestId('settings-save-button').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('settings-public-notice-input')).toHaveValue('testing-unsaved-notice');
  await navigate(page, '/timetable');
  await expect(page.locator('body')).toContainText(room.name);
  expect(reads('/api/public/rooms')).toBe(roomReads);
  expect(reads('/api/public/settings')).toBe(settingsReads);
});

test('a delayed invalidated reservation detail refresh preserves edits already typed', async ({ page, e2eData }) => {
  const room = await e2eData.createTestRoom('cache-edit-input');
  const reservation = await e2eData.createTestReservation(room.id, 'cache-edit-input');
  await page.clock.setFixedTime(new Date());
  await page.goto(`/admin/reservations/${reservation.id}`);
  await expect(page.getByTestId('reservation-purpose')).toHaveText(reservation.purpose);
  await renameRoom(page, room.name, e2eData.name('room-cache-edited'));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/admin/reservations/${reservation.id}`, async route => { await gate; await route.continue(); });
  const refreshed = page.waitForResponse(value => new URL(value.url()).pathname === `/api/admin/reservations/${reservation.id}`);
  await navigate(page, `/admin/reservations/${reservation.id}/edit`);
  await page.getByTestId('reservation-purpose-input').fill('testing-unsaved-reservation');
  release();
  await (await refreshed).finished();
  await expect(page.getByTestId('reservation-room-select')).toContainText('testing-room-cache-edited');
  await expect(page.getByTestId('reservation-purpose-input')).toHaveValue('testing-unsaved-reservation');
});
