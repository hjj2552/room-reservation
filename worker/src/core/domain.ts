import { policy, validation } from "./errors";

export type ReservationStatus = "REQUESTED" | "CONFIRMED" | "CANCELLED";
export type ReservationSource = "PUBLIC_FORM" | "ADMIN_GRID" | "ADMIN_MANUAL" | "RECURRING_GENERATED";
export type ConflictPolicy = "FAIL_ALL" | "SKIP_CONFLICTS";

export interface OperationSettings {
  organizationName: string;
  publicNotice: string | null;
  reservationEnabled: boolean;
  reservationDisabledMessage: string | null;
  semesterStartDate: string;
  semesterEndDate: string;
  openTime: string;
  closeTime: string;
  slotMinutes: 5;
  availableDaysOfWeek: string[];
  minReservationMinutes: number;
  maxReservationMinutes: number;
  adminContactEmail: string | null;
  adminContactPhone: string | null;
  completionMessage: string | null;
  version: number;
}

export interface ReservationInput {
  roomId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  purpose: string;
  startAt: string;
  endAt: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const instantPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;
const days = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

export function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) validation("Please check the request fields.");
  return value as Record<string, unknown>;
}

export function requireString(
  object: Record<string, unknown>,
  field: string,
  options: { max?: number; allowBlank?: boolean } = {},
): string {
  const value = object[field];
  if (typeof value !== "string" || (!options.allowBlank && value.trim().length === 0)) {
    validation("must not be blank", field);
  }
  if (options.max !== undefined && value.length > options.max) validation(`size must be between 0 and ${options.max}`, field);
  return value;
}

export function optionalString(
  object: Record<string, unknown>,
  field: string,
  max?: number,
): string | null {
  const value = object[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") validation("must be a string", field);
  if (max !== undefined && value.length > max) validation(`size must be between 0 and ${max}`, field);
  return value;
}

export function requireBoolean(object: Record<string, unknown>, field: string): boolean {
  const value = object[field];
  if (typeof value !== "boolean") validation("must not be null", field);
  return value;
}

export function requireInteger(object: Record<string, unknown>, field: string, minimum?: number): number {
  const value = object[field];
  if (!Number.isSafeInteger(value)) validation("must be an integer", field);
  if (minimum !== undefined && (value as number) < minimum) validation(`must be greater than or equal to ${minimum}`, field);
  return value as number;
}

export function requireUuid(object: Record<string, unknown>, field: string): string {
  const value = requireString(object, field);
  return parseUuid(value, field);
}

export function parseUuid(value: string | null | undefined, field = "id"): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) validation("must be a UUID", field);
  return value;
}

export function parseDate(value: string | null | undefined, field = "date"): string {
  if (typeof value !== "string") validation("Invalid date format.", field);
  const match = datePattern.exec(value);
  if (!match) validation("Invalid date format.", field);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    validation("Invalid date format.", field);
  }
  return value;
}

export function parseTime(value: string | null | undefined, field = "time"): string {
  if (typeof value !== "string") validation("Invalid time format.", field);
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || (match[3] !== undefined && match[3] !== "00")) {
    validation("Time must use HH:mm without seconds or fractional seconds.", field);
  }
  return `${match[1]}:${match[2]}`;
}

export function parseBooleanParameter(value: string | null, field: string, fallback: boolean): boolean {
  if (value === null) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  validation("must be true or false", field);
}

export function parseEnumParameter<T extends string>(
  value: string | null | undefined,
  field: string,
  allowed: readonly T[],
): T | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (!allowed.includes(value as T)) validation(`must be one of ${allowed.join(", ")}`, field);
  return value as T;
}

export function requireEmail(object: Record<string, unknown>, field: string): string {
  const value = requireString(object, field, { max: 255 });
  if (!emailPattern.test(value)) validation("must be a well-formed email address", field);
  return value;
}

export function parseReservationInput(object: Record<string, unknown>): ReservationInput {
  const input = {
    roomId: requireUuid(object, "roomId"),
    applicantName: requireString(object, "applicantName", { max: 100 }),
    applicantEmail: requireEmail(object, "applicantEmail"),
    applicantPhone: requireString(object, "applicantPhone", { max: 50 }),
    purpose: requireString(object, "purpose", { max: 500 }),
    startAt: requireString(object, "startAt"),
    endAt: requireString(object, "endAt"),
  };
  parseInstant(input.startAt, "startAt");
  parseInstant(input.endAt, "endAt");
  return input;
}

export function parseInstant(value: string, field = "dateTime"): Date {
  const match = instantPattern.exec(value);
  if (!match) validation("Invalid date/time format.", field);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day
    || hour > 23
    || minute > 59
    || second > 59
  ) {
    validation("Invalid date/time format.", field);
  }
  if (match[8] !== "Z") {
    const [offsetHour, offsetMinute] = match[8]!.slice(1).split(":").map(Number) as [number, number];
    if (offsetHour > 23 || offsetMinute > 59) validation("Invalid date/time format.", field);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    validation("Invalid date/time format.", field);
  }
  return parsed;
}

function serviceParts(value: Date): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value)) {
    if (part.type !== "literal") result[part.type] = part.value;
  }
  return result;
}

export function validateReservationPolicy(
  roomUsable: boolean,
  settings: OperationSettings,
  input: ReservationInput,
  context: "PUBLIC" | "ADMIN",
  now: Date,
): void {
  if (!roomUsable) policy("ROOM_DISABLED", "This room is not available.");
  const start = parseInstant(input.startAt, "startAt");
  const end = parseInstant(input.endAt, "endAt");
  if (start.getTime() >= end.getTime()) policy("VALIDATION_ERROR", "Start time must be before end time.");
  if (context === "PUBLIC" && start.getTime() < now.getTime()) {
    policy("PAST_RESERVATION_TIME", "이미 지난 시간에는 예약할 수 없습니다. 예약 시간을 다시 확인해 주세요.");
  }
  if (!settings.reservationEnabled) {
    policy("RESERVATION_DISABLED", settings.reservationDisabledMessage || "Reservation is currently disabled.");
  }

  const startParts = serviceParts(start);
  const endParts = serviceParts(end);
  const startDate = `${startParts.year}-${startParts.month}-${startParts.day}`;
  const endDate = `${endParts.year}-${endParts.month}-${endParts.day}`;
  if (startParts.second !== "00" || endParts.second !== "00" || start.getUTCMilliseconds() !== 0 || end.getUTCMilliseconds() !== 0) {
    policy("INVALID_SLOT_UNIT", "Reservation start and end times must not include seconds or fractional seconds.");
  }
  if (startDate !== endDate) policy("OUTSIDE_OPERATING_HOURS", "Reservations must be within a single day.");
  if (startDate < settings.semesterStartDate || startDate > settings.semesterEndDate) {
    policy("OUTSIDE_SEMESTER_PERIOD", "The requested date is outside the semester period.");
  }
  const weekday = startParts.weekday?.slice(0, 3).toUpperCase();
  if (!weekday || !settings.availableDaysOfWeek.includes(weekday)) {
    policy("OUTSIDE_OPERATING_DAYS", "The requested day is not available for reservations.");
  }
  const startTime = `${startParts.hour}:${startParts.minute}`;
  const endTime = `${endParts.hour}:${endParts.minute}`;
  if (startTime < settings.openTime.slice(0, 5) || endTime > settings.closeTime.slice(0, 5)) {
    policy("OUTSIDE_OPERATING_HOURS", "The requested time is outside operating hours.");
  }
  const duration = (end.getTime() - start.getTime()) / 60_000;
  if (duration < settings.minReservationMinutes || duration > settings.maxReservationMinutes) {
    policy("INVALID_DURATION", "The requested duration is not allowed.");
  }
  if (Number(startParts.minute) % 5 !== 0 || Number(endParts.minute) % 5 !== 0 || duration % 5 !== 0) {
    policy("INVALID_SLOT_UNIT", "The requested time must use 5-minute increments.");
  }
}

export function normalizeDays(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) validation("must not be empty", "daysOfWeek");
  return [...new Set(value.map((item) => {
    if (typeof item !== "string") validation("Invalid day of week", "daysOfWeek");
    const normalized = item.trim().toUpperCase().slice(0, 3);
    if (!days.has(normalized)) validation(`Invalid day of week: ${item}`, "daysOfWeek");
    return normalized;
  }))];
}

export function serviceOffsetDateTime(date: string, time: string): string {
  return `${date}T${time.length === 5 ? `${time}:00` : time}+09:00`;
}

export function datesInRange(start: string, end: string): string[] {
  parseDate(start, "startDate");
  parseDate(end, "endDate");
  if (start > end) {
    validation("Start date must be before or equal to end date.", "startDate");
  }
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const final = new Date(`${end}T00:00:00Z`);
  while (cursor <= final) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function weekdayCode(date: string): string {
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

export function parsePage(url: URL): { page: number; size: number; offset: number } {
  const page = url.searchParams.has("page") ? Number(url.searchParams.get("page")) : 0;
  const requestedSize = url.searchParams.has("size") ? Number(url.searchParams.get("size")) : 20;
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(requestedSize) || requestedSize < 1) {
    validation("Page must be non-negative and size must be positive.");
  }
  const size = Math.min(100, requestedSize);
  return { page, size, offset: page * size };
}

export function paged<T>(items: T[], page: number, size: number, totalItems: number) {
  return { items, page, size, totalItems, totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / size) };
}
