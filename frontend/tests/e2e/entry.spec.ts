import { expect, test } from '@playwright/test';

const loadingMessage = '데이터를 불러오는 중입니다. 잠시만 기다려주세요...';
const failureMessage = '데이터를 불러오지 못했습니다. 새로고침하거나 잠시 후 다시 시도해주세요.';
const publicSettings = {
  organizationName: 'Testing Organization',
  publicNotice: null,
  reservationEnabled: true,
  reservationDisabledMessage: null,
  semesterStartDate: '2026-01-01',
  semesterEndDate: '2026-12-31',
  openTime: '09:00',
  closeTime: '18:00',
  slotMinutes: 30,
  availableDaysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  minReservationMinutes: 30,
  maxReservationMinutes: 240,
  adminContactEmail: null,
  adminContactPhone: null,
  completionMessage: null,
};

test('immediate readiness success shows the entry choices and reuses the settings cache', async ({ page }) => {
  let settingsRequests = 0;
  await page.route('**/api/public/settings', async (route) => {
    settingsRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(publicSettings),
    });
  });

  await page.goto('/');

  await expect(page.getByTestId('entry-public-link')).toBeVisible();
  await expect(page.getByTestId('entry-admin-link')).toBeVisible();
  await expect(page.locator('.entry-organization-name')).toHaveText(publicSettings.organizationName);
  await expect(page.locator('.entry-organization-name')).toHaveCSS('font-size', '34px');
  await expect(page.getByText(loadingMessage)).toHaveCount(0);
  await expect.poll(() => settingsRequests).toBe(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.entry-organization-name')).toHaveCSS('font-size', '26px');
  await expect(page.getByTestId('entry-public-link')).toBeVisible();
  await expect(page.getByTestId('entry-admin-link')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('readiness retries two 503 responses before showing the entry choices', async ({ page }) => {
  let settingsRequests = 0;
  await page.route('**/api/public/settings', async (route) => {
    settingsRequests += 1;
    if (settingsRequests <= 2) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(publicSettings),
    });
  });

  await page.goto('/');

  await expect(page.getByRole('status')).toHaveText(loadingMessage);
  await expect(page.getByTestId('entry-public-link')).toHaveCount(0);
  await expect(page.locator('.login-panel')).toHaveCount(0);
  await expect(page.getByTestId('entry-public-link')).toBeVisible();
  await expect.poll(() => settingsRequests).toBe(3);
});

test('readiness does not accept an HTML response as public settings', async ({ page }) => {
  let settingsRequests = 0;
  await page.route('**/api/public/settings', async (route) => {
    settingsRequests += 1;
    if (settingsRequests === 1) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(publicSettings),
    });
  });

  await page.goto('/');

  await expect(page.getByRole('status')).toHaveText(loadingMessage);
  await expect(page.getByTestId('entry-public-link')).toBeVisible();
  await expect.poll(() => settingsRequests).toBe(2);
});

test('direct admin login access waits for app readiness', async ({ page }) => {
  let settingsRequests = 0;
  await page.route('**/api/public/settings', async (route) => {
    settingsRequests += 1;
    if (settingsRequests === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(publicSettings),
    });
  });

  await page.goto('/admin/login');

  await expect(page.getByRole('status')).toHaveText(loadingMessage);
  await expect(page.locator('.login-panel')).toHaveCount(0);
  await expect(page.locator('.login-panel')).toBeVisible();
  await expect.poll(() => settingsRequests).toBe(2);
});

test('non-retryable readiness failure stops without actions or further requests', async ({ page }) => {
  let settingsRequests = 0;
  await page.route('**/api/public/settings', async (route) => {
    settingsRequests += 1;
    await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');

  await expect(page.getByRole('alert')).toHaveText(failureMessage);
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link')).toHaveCount(0);
  await page.waitForTimeout(1_200);
  expect(settingsRequests).toBe(1);
});

test('root shows public and admin entry choices', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('entry-public-link')).toBeVisible();
  await expect(page.getByTestId('entry-admin-link')).toBeVisible();
});

test('root public choice opens the public timetable UI', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-public-link').click();

  await expect(page).toHaveURL(new RegExp('/timetable$'));
  await expect(page.getByTestId('public-new-request-button')).toBeVisible();
});

test('root admin choice opens the admin login UI', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-admin-link').click();

  await expect(page).toHaveURL(new RegExp('/admin/login$'));
  await expect(page.locator('.login-panel')).toBeVisible();
});

test('prefixless admin aliases fall through to the public root', async ({ page }) => {
  const removedAdminAliases = [
    '/login',
    '/reservations',
    '/recurrences',
    '/recurrences/legacy-recurrence',
    '/rooms',
    '/settings',
    '/audit?status=UPDATED',
  ];

  for (const path of removedAdminAliases) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('entry-public-link')).toBeVisible();
  }
});

