import { expect, test } from '@playwright/test';
import { createRoomByApi, loginByApi, nextWeekdayAtLocalInput } from './helpers';

test('예약 목록 필터는 URL query에 반영되고 새로고침 후 유지된다', async ({ page }) => {
  await page.goto('/reservations');

  await page.getByLabel('상태').selectOption('CONFIRMED');
  await expect(page).toHaveURL(/status=CONFIRMED/);
  await page.getByLabel('검색어').fill('E2E');
  await expect(page).toHaveURL(/keyword=E2E/);
  await page.getByLabel('시작일').fill('2026-05-01');
  await page.getByRole('button', { name: '조회' }).click();

  await expect(page).toHaveURL(/status=CONFIRMED/);
  await expect(page).toHaveURL(/keyword=E2E/);
  await expect(page).toHaveURL(/fromDate=2026-05-01/);
  await expect(page).toHaveURL(/page=0/);

  await page.reload();

  await expect(page.getByLabel('상태')).toHaveValue('CONFIRMED');
  await expect(page.getByLabel('검색어')).toHaveValue('E2E');
  await expect(page.getByLabel('시작일')).toHaveValue('2026-05-01');
});

test('관리자가 예약을 생성하면 상세와 목록에서 확인할 수 있다', async ({ page, request }) => {
  await loginByApi(request);
  const unique = Date.now();
  const room = await createRoomByApi(request, `E2E Reservation Room ${unique}`);
  const purpose = `E2E reservation create ${unique}`;

  await page.goto('/reservations/new');
  await page.getByLabel('강의실').selectOption({ label: room.name });
  await page.getByLabel('신청자 이름').fill('E2E 운영자');
  await page.getByLabel('이메일').fill(`reservation-${unique}@example.com`);
  await page.getByLabel('전화번호').fill('010-1111-2222');
  await page.getByLabel('예약 목적').fill(purpose);
  await page.getByLabel('시작 시간').fill(nextWeekdayAtLocalInput(10, 0));
  await page.getByLabel('종료 시간').fill(nextWeekdayAtLocalInput(11, 0));
  await page.getByLabel('처리 메모').fill('E2E 생성 확인');
  await page.getByRole('button', { name: '저장' }).click();

  await expect(page).toHaveURL(/\/reservations\/[0-9a-f-]+$/);
  await expect(page.getByText(purpose)).toBeVisible();
  await expect(page.getByRole('heading', { name: room.name })).toBeVisible();

  await page.goto(`/reservations?keyword=${encodeURIComponent(purpose)}`);
  await expect(page.getByRole('table', { name: '예약 목록' })).toContainText(purpose);
  await expect(page.getByRole('table', { name: '예약 목록' })).toContainText(room.name);
});
