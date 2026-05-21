import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const adminCredentials = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'admin1234',
};

export async function loginByUi(page: Page) {
  await page.goto('/login');
  await page.getByLabel('아이디').fill(adminCredentials.username);
  await page.getByLabel('비밀번호').fill(adminCredentials.password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/reservations/);
  await expect(page.getByRole('heading', { name: '예약 목록' })).toBeVisible();
}

export async function loginByApi(request: APIRequestContext) {
  const response = await request.post('/api/auth/admin/login', {
    data: adminCredentials,
  });
  expect(response.ok()).toBeTruthy();
}

export async function createRoomByApi(request: APIRequestContext, name: string) {
  const response = await request.post('/api/admin/rooms', {
    data: {
      name,
      location: 'E2E Test Building',
      capacity: 12,
      description: 'Created by admin frontend E2E',
      enabled: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ id: string; name: string }>;
}

export async function createReservationByApi(
  request: APIRequestContext,
  roomId: string,
  purpose: string,
) {
  const startAt = nextWeekdayAtOffset(12, 0);
  const response = await request.post('/api/admin/reservations', {
    data: {
      roomId,
      applicantName: 'E2E 감사',
      applicantEmail: `audit-${Date.now()}@example.com`,
      applicantPhone: '010-1000-2000',
      purpose,
      startAt,
      endAt: addHours(startAt, 1),
      status: 'CONFIRMED',
      memo: 'E2E audit seed',
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ id: string }>;
}

export function nextWeekdayAtLocalInput(hour: number, minute: number) {
  const date = nextWeekdayDate();
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function nextWeekdayAtOffset(hour: number, minute: number) {
  return `${nextWeekdayAtLocalInput(hour, minute)}:00+09:00`;
}

function nextWeekdayDate() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

function addHours(offsetDateTime: string, hours: number) {
  const [datePart, offsetPart] = offsetDateTime.split('+');
  const date = new Date(`${datePart}+${offsetPart}`);
  date.setHours(date.getHours() + hours);
  const local = new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19);
  return `${local}+09:00`;
}
