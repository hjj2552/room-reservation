import { expect, test } from '@playwright/test';
import { loginByUi } from './helpers';

test('비로그인 상태에서 보호 라우트 접근 시 로그인 화면으로 이동한다', async ({ page }) => {
  await page.goto('/admin/rooms');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: '강의실 예약 운영 로그인' })).toBeVisible();
});

test('관리자 로그인 후 예약 목록에 진입할 수 있다', async ({ page }) => {
  await loginByUi(page);
  await expect(page.getByRole('link', { name: '예약 목록' })).toBeVisible();
});
