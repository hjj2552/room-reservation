import { expect, type APIRequestContext, type Page } from '@playwright/test';

export interface E2eRoom {
  id: string;
  name: string;
  location?: string | null;
  capacity?: number | null;
  description?: string | null;
  enabled?: boolean;
}

export interface E2eReservation {
  id: string;
  purpose?: string;
}

export interface E2eRecurrence {
  recurrenceId: string;
  createdCount: number;
  skippedCount?: number;
}

export interface E2eSettings {
  organizationName: string;
  publicNotice: string | null;
  reservationEnabled: boolean;
  reservationDisabledMessage: string | null;
  semesterStartDate: string;
  semesterEndDate: string;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  availableDaysOfWeek: string[];
  minReservationMinutes: number;
  maxReservationMinutes: number;
  requirePhone: boolean;
  adminContactName: string | null;
  adminContactEmail: string | null;
  adminContactPhone: string | null;
  completionMessage: string | null;
  version: number;
}

export const adminCredentials = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'admin1234',
};

export const E2E_TEST_DATA_PREFIX = 'e2e-';

export async function loginByUi(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('아이디').fill(adminCredentials.username);
  await page.getByLabel('비밀번호').fill(adminCredentials.password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/admin\/reservations/);
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
      location: `${E2E_TEST_DATA_PREFIX}test-building`,
      capacity: 12,
      description: `${E2E_TEST_DATA_PREFIX}created-by-frontend-e2e`,
      enabled: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<E2eRoom>;
}

export async function deleteRoomByApi(request: APIRequestContext, roomId: string) {
  const response = await request.delete(`/api/admin/rooms/${roomId}`);
  expect([204, 404, 409]).toContain(response.status());
}

export async function createReservationByApi(
  request: APIRequestContext,
  roomId: string,
  purpose: string,
  options: { startAt?: string; endAt?: string; memo?: string } = {},
) {
  const startAt = options.startAt || nextWeekdayAtOffset(12, 0);
  const response = await request.post('/api/admin/reservations', {
    data: {
      roomId,
      applicantName: `${E2E_TEST_DATA_PREFIX}admin`,
      applicantEmail: `${E2E_TEST_DATA_PREFIX}reservation-${Date.now()}@example.test`,
      applicantPhone: '010-1000-2000',
      purpose,
      startAt,
      endAt: options.endAt || addHours(startAt, 1),
      status: 'CONFIRMED',
      memo: options.memo || `${E2E_TEST_DATA_PREFIX}audit-seed`,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<E2eReservation>;
}

export async function cancelReservationByApi(request: APIRequestContext, reservationId: string, memo?: string) {
  const response = await request.post(`/api/admin/reservations/${reservationId}/cancel`, {
    data: memo ? { memo } : undefined,
  });
  expect([200, 404, 409]).toContain(response.status());
}

export async function deleteReservationByApi(request: APIRequestContext, reservationId: string, memo?: string) {
  const response = await request.delete(`/api/admin/reservations/${reservationId}`, {
    data: memo ? { memo } : undefined,
  });
  expect([204, 404]).toContain(response.status());
}

export async function cancelRecurrenceByApi(request: APIRequestContext, recurrenceId: string, memo?: string) {
  const response = await request.post(`/api/admin/recurrences/${recurrenceId}/cancel`, {
    data: memo ? { memo } : undefined,
  });
  expect([204, 404, 409]).toContain(response.status());
}

export async function createRecurrenceByApi(
  request: APIRequestContext,
  roomId: string,
  purpose: string,
  options: {
    startDate?: string;
    endDate?: string;
    dayOfWeek?: string;
    startTime?: string;
    endTime?: string;
    conflictPolicy?: 'SKIP_CONFLICTS' | 'FAIL_ALL' | 'CREATE_AVAILABLE_ONLY';
  } = {},
) {
  const recurrenceTime = nextWeekdayRecurrenceInputs();
  const response = await request.post('/api/admin/recurrences', {
    data: {
      roomId,
      applicantName: `${E2E_TEST_DATA_PREFIX}recurring-admin`,
      applicantEmail: `${E2E_TEST_DATA_PREFIX}recurring-${Date.now()}@example.test`,
      applicantPhone: '010-2222-3333',
      purpose,
      startDate: options.startDate || recurrenceTime.startDate,
      endDate: options.endDate || recurrenceTime.endDate,
      daysOfWeek: [options.dayOfWeek || recurrenceTime.dayOfWeek],
      startTime: options.startTime || recurrenceTime.startTime,
      endTime: options.endTime || recurrenceTime.endTime,
      conflictPolicy: options.conflictPolicy || 'FAIL_ALL',
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<E2eRecurrence>;
}

export async function cleanupE2eDataByApi(request: APIRequestContext) {
  const response = await request.delete(`/api/admin/test-data/e2e?prefix=${encodeURIComponent(E2E_TEST_DATA_PREFIX)}`);
  expect([200, 404]).toContain(response.status());
  return response.status() === 200 ? response.json() : null;
}

export async function getSettingsByApi(request: APIRequestContext) {
  const response = await request.get('/api/admin/settings');
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<E2eSettings>;
}

export async function updateSettingsByApi(request: APIRequestContext, settings: E2eSettings) {
  const response = await request.put('/api/admin/settings', {
    data: settings,
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<E2eSettings>;
}

export function uniqueE2eName(label: string) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${E2E_TEST_DATA_PREFIX}${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nextWeekdayReservationLocalInputs({
  daysAhead = 21,
  startHour = 13,
  endHour = 14,
  minute = 0,
} = {}) {
  const date = nextWeekdayDateInKst(daysAhead);
  const time = (hour: number) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return {
    date,
    startAt: `${date}T${time(startHour)}`,
    endAt: `${date}T${time(endHour)}`,
  };
}

export function nextWeekdayRecurrenceInputs({
  daysAhead = 28,
  startHour = 13,
  endHour = 14,
  weeks = 0,
} = {}) {
  const date = nextWeekdayDateInKst(daysAhead);
  const endDate = addDays(date, weeks * 7);
  return {
    startDate: date,
    endDate,
    dayOfWeek: weekdayCode(date),
    startTime: `${String(startHour).padStart(2, '0')}:00`,
    endTime: `${String(endHour).padStart(2, '0')}:00`,
    firstStartAt: `${date}T${String(startHour).padStart(2, '0')}:00:00+09:00`,
    firstEndAt: `${date}T${String(endHour).padStart(2, '0')}:00:00+09:00`,
  };
}

export function nextWeekdayAtLocalInput(hour: number, minute: number, daysAhead = 14) {
  const date = nextWeekdayDateInKst(daysAhead);
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function nextWeekdayAtOffset(hour: number, minute: number, daysAhead = 14) {
  return `${nextWeekdayAtLocalInput(hour, minute, daysAhead)}:00+09:00`;
}

function nextWeekdayDateInKst(daysAhead: number) {
  const today = kstDateParts(new Date());
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day + daysAhead));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

function kstDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
  };
}

function weekdayCode(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][day];
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addHours(offsetDateTime: string, hours: number) {
  const [datePart, offsetPart] = offsetDateTime.split('+');
  const date = new Date(`${datePart}+${offsetPart}`);
  date.setHours(date.getHours() + hours);
  const local = new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19);
  return `${local}+09:00`;
}
