import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { getSettingsByApi, type E2eSettings } from './helpers';

const settingsPath = '/api/admin/settings';

async function visit(page: Page, path: '/admin/rooms' | '/admin/settings') {
  await page.locator(`a[href="${path}"]`).first().click();
  await expect(page).toHaveURL(path);
  if (path === '/admin/rooms') {
    // The URL can change before the lazy page replaces the settings editor.
    await expect(page.getByRole('heading', { name: '공간 관리', exact: true })).toBeVisible();
    await expect(page.getByTestId('settings-form')).toHaveCount(0);
  }
}

test('settings entry waits for a fresh response even with valid cache, and retries without exposing cached inputs', async ({ page, request }) => {
  const original = await getSettingsByApi(request);
  let server = { ...original, organizationName: 'testing-cached-settings', version: 10 };
  let reads = 0;
  let fail = false;
  let pending: Promise<void> | undefined;
  let release!: () => void;
  await page.clock.setFixedTime(new Date()); // Keep the existing 30-second cache fresh.
  // Exercise the lazy-route race even on a fast local Vite server.
  await page.route('**/admin/pages/RoomsPage.tsx*', async route => {
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.fulfill({ response });
  });
  await page.route(`**${settingsPath}`, async route => {
    reads += 1;
    await pending;
    await route.fulfill(fail
      ? { status: 500, json: { message: 'testing-settings-unavailable' } }
      : { json: server });
  });
  await page.goto('/admin/settings');
  const input = page.getByTestId('settings-organization-input');
  await expect(input).toHaveValue(server.organizationName);
  await visit(page, '/admin/rooms');
  const before = reads;
  server = { ...server, organizationName: 'testing-fresh-settings', version: 11 };
  pending = new Promise(resolve => { release = resolve; });
  await visit(page, '/admin/settings');
  // Development StrictMode can abort and restart a mount request.
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(page.getByTestId('settings-form')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '불러오는 중' })).toBeVisible();
  release();
  await expect(input).toHaveValue(server.organizationName);

  await visit(page, '/admin/rooms');
  fail = true;
  await visit(page, '/admin/settings');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('settings-form')).toHaveCount(0);
  fail = false;
  server = { ...server, organizationName: 'testing-retried-settings', version: 12 };
  pending = new Promise(resolve => { release = resolve; });
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(page.getByTestId('settings-form')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '불러오는 중' })).toBeVisible();
  release();
  await expect(input).toHaveValue(server.organizationName);
});

test('settings preserve draft and version through cache refresh and failed save, then adopt the successful response', async ({ page, request }) => {
  const original = await getSettingsByApi(request);
  let server = { ...original, organizationName: 'testing-initial-settings', version: 20 };
  let reads = 0;
  const writes: E2eSettings[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const saved = {
    ...server, organizationName: 'testing-normalized-save', version: 22,
    openTime: '09:00:00', closeTime: '21:00:00',
    specialApprovalStartTime: '18:00:00', specialApprovalEndTime: '21:00:00',
    availableDaysOfWeek: ['THU', 'TUE', 'WED'], specialApprovalDaysOfWeek: ['THU', 'TUE'],
    slotMinutes: 30,
  };
  await page.route(`**${settingsPath}`, async route => {
    if (route.request().method() === 'GET') {
      reads += 1;
      return route.fulfill({ json: server });
    }
    writes.push(route.request().postDataJSON());
    if (writes.length === 1) {
      await pending;
      return route.fulfill({ status: 409, json: { code: 'VERSION_CONFLICT', message: 'testing-version-conflict' } });
    }
    return route.fulfill({ json: saved });
  });
  await page.goto('/admin/settings');
  const input = page.getByTestId('settings-organization-input');
  const form = page.getByTestId('settings-form');
  const save = page.getByTestId('settings-save-button');
  await expect(input).toHaveValue(server.organizationName);
  await input.fill('testing-unsaved-settings');
  const before = reads;
  server = { ...server, organizationName: 'testing-background-settings', version: 21 };
  await page.clock.setFixedTime(new Date(Date.now() + 60_000));
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === settingsPath);
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
  await (await refreshed).finished();
  await expect.poll(() => reads).toBe(before + 1);
  await expect(input).toHaveValue('testing-unsaved-settings');
  await save.click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ organizationName: 'testing-unsaved-settings', version: 20 });
  await expect(save).toBeDisabled();
  for (const control of await form.locator('input, select, textarea').all()) await expect(control).toBeDisabled();
  await form.evaluate(element => (element as HTMLFormElement).requestSubmit());
  expect(writes).toHaveLength(1);
  release();
  await expect(page.getByRole('alert')).toContainText('다른 사용자가 먼저 수정했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.');
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('testing-unsaved-settings');
  expect(reads).toBe(before + 1); // A failed mutation does not invalidate the cache.
  await input.fill('testing-retry-settings');
  server = { ...server, organizationName: 'testing-after-save-refresh', version: 23 };
  await save.click();
  await expect(input).toHaveValue(saved.organizationName);
  await expect.poll(() => reads).toBe(before + 2); // Existing post-save invalidation remains.
  await expect(input).toHaveValue(saved.organizationName);
  await expect(page.getByTestId('settings-open-time-input')).toHaveValue('09:00');
  await expect(page.getByTestId('settings-close-time-input')).toHaveValue('21:00');
  await expect(save).toBeEnabled();
  expect(writes[1]).toMatchObject({ organizationName: 'testing-retry-settings', version: 20 });
  await save.click();
  await expect.poll(() => writes.length).toBe(3);
  expect(writes[2]).toMatchObject({
    organizationName: saved.organizationName, version: 22, slotMinutes: 5,
    openTime: '09:00', closeTime: '21:00',
    availableDaysOfWeek: ['TUE', 'WED', 'THU'], specialApprovalDaysOfWeek: ['TUE', 'THU'],
  });
});

test('leaving a loading settings page cancels its request and a late response cannot initialize the next visit', async ({ page, request }) => {
  const original = await getSettingsByApi(request);
  let reads = 0;
  let hold = true;
  let lateCompleted = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${settingsPath}`, async route => {
    reads += 1;
    const abandoned = hold;
    if (abandoned) await pending;
    await route.fulfill({ json: {
      ...original, organizationName: abandoned ? 'testing-abandoned-settings' : 'testing-current-settings',
      version: abandoned ? 30 : 31,
    } });
    if (abandoned) lateCompleted += 1;
  });
  await page.goto('/admin/rooms');
  await expect(page.getByRole('heading', { name: '공간 관리', exact: true })).toBeVisible();
  await visit(page, '/admin/settings');
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(page.getByTestId('settings-form')).toHaveCount(0);
  const cancelled = page.waitForEvent('requestfailed', value => new URL(value.url()).pathname === settingsPath);
  await visit(page, '/admin/rooms');
  await cancelled;
  const before = reads;
  hold = false;
  await visit(page, '/admin/settings');
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(page.getByTestId('settings-organization-input')).toHaveValue('testing-current-settings');
  await page.getByTestId('settings-organization-input').fill('testing-current-draft');
  release();
  await expect.poll(() => lateCompleted).toBe(before);
  await expect(page.getByTestId('settings-organization-input')).toHaveValue('testing-current-draft');
});
