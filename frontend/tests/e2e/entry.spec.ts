import { expect, test, type Page, type Route } from '@playwright/test';

const loadingMessage = '데이터를 불러오는 중입니다. 최대 3분 정도 걸릴 수 있습니다.';
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

async function advanceClock(page: Page, totalMs: number) {
  let remainingMs = totalMs;
  while (remainingMs > 0) {
    const stepMs = Math.min(5_000, remainingMs);
    await page.clock.runFor(stepMs);
    await page.evaluate(() => undefined);
    remainingMs -= stepMs;
  }
}

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

test('readiness shows the loading message only after 300ms', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-14T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-07-14T00:00:00Z'));
  let releaseRequest: (() => Promise<void>) | undefined;
  await page.route('**/api/public/settings', async (route) => {
    await new Promise<void>((resolve) => {
      releaseRequest = async () => {
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(publicSettings),
          });
        } finally {
          resolve();
        }
      };
    });
  });

  await page.goto('/');
  await expect.poll(() => typeof releaseRequest).toBe('function');
  await advanceClock(page, 299);
  await expect(page.getByText(loadingMessage)).toHaveCount(0);

  await advanceClock(page, 1);
  await expect(page.getByRole('status')).toHaveText(loadingMessage);
  await expect(page.getByRole('status')).toHaveAttribute('aria-busy', 'true');

  await releaseRequest?.();
  await expect(page.getByTestId('entry-public-link')).toBeVisible();
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

test('readiness retries HTML, malformed JSON, and invalid settings before succeeding', async ({ page }) => {
  let settingsRequests = 0;
  await page.route('**/api/public/settings', async (route) => {
    settingsRequests += 1;
    if (settingsRequests === 1) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' });
      return;
    }
    if (settingsRequests === 2) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{' });
      return;
    }
    if (settingsRequests === 3) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ organizationName: 'Incomplete settings' }),
      });
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
  await expect.poll(() => settingsRequests).toBe(4);
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

test('valid settings just before the 180-second deadline enter without reloading', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-14T00:00:00Z') });
  let settingsRequests = 0;
  let holdNextRequest = false;
  let heldRequest = false;
  let releaseSuccess: (() => Promise<void>) | undefined;
  let mainFrameNavigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigations += 1;
  });
  await page.route('**/api/public/settings', async (route) => {
    settingsRequests += 1;
    if (!holdNextRequest) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }

    heldRequest = true;
    await new Promise<void>((resolve) => {
      releaseSuccess = async () => {
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(publicSettings),
          });
        } finally {
          resolve();
        }
      };
    });
  });

  await page.goto('/');
  const startedAt = await page.evaluate(() => Date.now());
  const navigationsAfterGoto = mainFrameNavigations;
  await advanceClock(page, 170_000);

  holdNextRequest = true;
  for (let elapsedMs = 0; elapsedMs < 6_000 && !heldRequest; elapsedMs += 1_000) {
    await advanceClock(page, 1_000);
  }
  await expect.poll(() => heldRequest).toBe(true);

  const elapsedMs = await page.evaluate((start) => Date.now() - start, startedAt);
  await advanceClock(page, Math.max(179_000 - elapsedMs, 0));
  await releaseSuccess?.();

  await expect(page.getByTestId('entry-public-link')).toBeVisible();
  expect(mainFrameNavigations).toBe(navigationsAfterGoto);
  const requestsAfterSuccess = settingsRequests;
  await advanceClock(page, 10_000);
  expect(settingsRequests).toBe(requestsAfterSuccess);
});

test('the 180-second deadline aborts checking and stops every later request', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-14T00:00:00Z') });
  let settingsRequests = 0;
  await page.route('**/api/public/settings', async (route) => {
    settingsRequests += 1;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await advanceClock(page, 178_000);
  await expect(page.getByRole('status')).toHaveText(loadingMessage);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await advanceClock(page, 2_000);
  await expect(page.getByRole('alert')).toHaveText(failureMessage);
  await expect(page.getByRole('alert')).not.toHaveAttribute('aria-busy');
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link')).toHaveCount(0);
  const requestsAtFailure = settingsRequests;

  await advanceClock(page, 60_000);
  expect(settingsRequests).toBe(requestsAtFailure);
});

test('readiness requests never overlap', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-14T00:00:00Z') });
  let settingsRequests = 0;
  let inFlightRequests = 0;
  let maxInFlightRequests = 0;
  let holdFirstRequest = true;
  let releaseFirstRequest: (() => Promise<void>) | undefined;

  await page.route('**/api/public/settings', async (route: Route) => {
    settingsRequests += 1;
    inFlightRequests += 1;
    maxInFlightRequests = Math.max(maxInFlightRequests, inFlightRequests);
    try {
      if (holdFirstRequest) {
        await new Promise<void>((resolve) => {
          releaseFirstRequest = async () => {
            holdFirstRequest = false;
            try {
              await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
            } finally {
              resolve();
            }
          };
        });
        return;
      }
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    } finally {
      inFlightRequests -= 1;
    }
  });

  await page.goto('/');
  await expect.poll(() => inFlightRequests).toBe(1);
  await advanceClock(page, 9_000);
  expect(settingsRequests).toBe(1);
  expect(maxInFlightRequests).toBe(1);

  await releaseFirstRequest?.();
  await expect.poll(() => inFlightRequests).toBe(0);
  await advanceClock(page, 6_000);
  expect(settingsRequests).toBeGreaterThan(1);
  expect(maxInFlightRequests).toBe(1);
});

test('a non-retryable response after a retry fails immediately', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-14T00:00:00Z') });
  let settingsRequests = 0;
  await page.route('**/api/public/settings', async (route) => {
    settingsRequests += 1;
    await route.fulfill({
      status: settingsRequests === 1 ? 503 : 400,
      contentType: 'application/json',
      body: '{}',
    });
  });

  await page.goto('/');
  await advanceClock(page, 5_000);

  await expect(page.getByRole('alert')).toHaveText(failureMessage);
  expect(settingsRequests).toBe(2);
  await advanceClock(page, 60_000);
  expect(settingsRequests).toBe(2);
});

test('an initial non-retryable failure stops without actions or further requests', async ({ page }) => {
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

test('StrictMode unmount cleanup leaves one loop and no post-success timers or requests', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-14T00:00:00Z') });
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
  expect(settingsRequests).toBe(1);

  await advanceClock(page, 240_000);
  expect(settingsRequests).toBe(1);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
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

