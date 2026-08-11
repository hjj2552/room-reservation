import { defineConfig, devices } from '@playwright/test';

const remoteE2e = process.env.E2E_REMOTE === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: remoteE2e ? 60_000 : 30_000,
  workers: 1,
  expect: {
    timeout: remoteE2e ? 15_000 : 8_000,
  },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
    timezoneId: 'Asia/Seoul',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'unauthenticated',
      testMatch: /(auth|entry)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'admin',
      dependencies: ['setup'],
      testIgnore: [/.*\.setup\.ts/, /(auth|entry)\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/admin.json',
      },
    },
  ],
});
