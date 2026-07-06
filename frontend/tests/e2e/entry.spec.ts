import { expect, test } from '@playwright/test';

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

