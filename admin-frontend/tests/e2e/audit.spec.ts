import { expect, test } from '@playwright/test';
import { createReservationByApi, createRoomByApi, loginByApi } from './helpers';

test('감사 이력 필터는 URL query에 반영되고 서버 결과 표를 렌더링한다', async ({ page, request }) => {
  await loginByApi(request);
  const unique = Date.now();
  const room = await createRoomByApi(request, `E2E Audit Room ${unique}`);
  const reservation = await createReservationByApi(request, room.id, `E2E audit reservation ${unique}`);

  await page.goto('/audit');
  await page.getByLabel('예약 ID').fill(reservation.id);
  await page.getByLabel('강의실').selectOption({ label: room.name });
  await page.getByLabel('처리 유형').selectOption('CREATED_BY_ADMIN');
  await page.getByRole('button', { name: '조회' }).click();

  await expect(page).toHaveURL(new RegExp(`reservationId=${reservation.id}`));
  await expect(page).toHaveURL(new RegExp(`roomId=${room.id}`));
  await expect(page).toHaveURL(/action=CREATED_BY_ADMIN/);
  await expect(page).toHaveURL(/page=0/);

  const table = page.getByRole('table', { name: '예약 처리 이력' });
  await expect(table).toContainText('관리자 생성');
  await expect(table).toContainText('E2E audit seed');

  await page.reload();
  await expect(page.getByLabel('예약 ID')).toHaveValue(reservation.id);
  await expect(page.getByLabel('강의실')).toHaveValue(room.id);
  await expect(page.getByLabel('처리 유형')).toHaveValue('CREATED_BY_ADMIN');
  await expect(table).toContainText('관리자 생성');
});
