import { expect, test } from '@playwright/test';

test('root shows public and admin entry choices', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '이용 목적을 선택해 주세요' })).toBeVisible();
  await expect(page.getByTestId('entry-public-link')).toContainText('일반 사용자');
  await expect(page.getByTestId('entry-admin-link')).toContainText('관리자');
});

test('root public choice opens the public reservation UI', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-public-link').click();

  await expect(page).toHaveURL(/\/public\/reservations\/new$/);
  await expect(page.getByRole('heading', { name: '시간표' })).toBeVisible();
});

test('root admin choice opens the admin login UI', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-admin-link').click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '강의실 예약 운영 로그인' })).toBeVisible();
});
