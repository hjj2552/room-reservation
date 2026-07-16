import { expect, test } from '@playwright/test';
import { loginByUi } from './helpers';

test('로그인 화면은 빈 자격 증명으로 시작한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/login');

  await expect(page.getByLabel('아이디')).toHaveValue('');
  await expect(page.getByLabel('비밀번호')).toHaveValue('');
  await expect(page.getByLabel('아이디')).toHaveAttribute('autocomplete', 'username');
  await expect(page.getByLabel('비밀번호')).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByLabel('아이디')).toHaveCSS('font-size', '16px');
  await expect(page.getByLabel('비밀번호')).toHaveCSS('font-size', '16px');
});

test('잘못된 자격 증명은 로그인 실패로만 안내한다', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('아이디').fill('testing-invalid-admin');
  await page.getByLabel('비밀번호').fill('testing-invalid-password');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page.getByRole('alert')).toHaveText('아이디 또는 비밀번호가 잘못되었습니다.');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page).not.toHaveURL(/\/admin\/reservations/);
});

test('비로그인 상태에서 보호 라우트 접근 시 로그인 화면으로 이동한다', async ({ page }) => {
  await page.goto('/admin/rooms');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: '공간 예약 운영 로그인' })).toBeVisible();
  await expect(page.getByText('아이디 또는 비밀번호가 잘못되었습니다.')).toHaveCount(0);
});

test('관리자 로그인 후 예약 목록에 진입할 수 있다', async ({ page }) => {
  await loginByUi(page);
  await expect(page.getByRole('link', { name: '예약 목록' })).toBeVisible();
});
