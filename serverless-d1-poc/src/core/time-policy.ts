export const INPUT_GRID_MS = 5 * 60 * 1000;
export const TIMETABLE_GRID_MS = 30 * 60 * 1000;
export const MIN_RESERVATION_MS = 30 * 60 * 1000;

export interface ReservationWindow {
  startAtUtcMs: number;
  endAtUtcMs: number;
}

export function parseUtcInstant(value: string): number {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error("UTC_OFFSET_REQUIRED");
  const utcMs = Date.parse(value);
  if (!Number.isSafeInteger(utcMs)) throw new Error("INVALID_INSTANT");
  return utcMs;
}

export function validateReservationWindow(
  window: ReservationWindow,
  nowUtcMs: number,
  actor: "public" | "admin",
): void {
  const { startAtUtcMs, endAtUtcMs } = window;
  if (!Number.isSafeInteger(startAtUtcMs) || !Number.isSafeInteger(endAtUtcMs)) {
    throw new Error("INVALID_INSTANT");
  }
  if (startAtUtcMs % INPUT_GRID_MS !== 0 || endAtUtcMs % INPUT_GRID_MS !== 0) {
    throw new Error("NOT_ON_FIVE_MINUTE_GRID");
  }
  if (endAtUtcMs <= startAtUtcMs || endAtUtcMs - startAtUtcMs < MIN_RESERVATION_MS) {
    throw new Error("INVALID_DURATION");
  }
  if (actor === "public" && startAtUtcMs < nowUtcMs) {
    throw new Error("PAST_RESERVATION");
  }
}

export function validateOperatingHours(openMinutes: number, closeMinutes: number): void {
  if (
    !Number.isInteger(openMinutes) ||
    !Number.isInteger(closeMinutes) ||
    openMinutes < 0 ||
    closeMinutes > 24 * 60 ||
    openMinutes % 30 !== 0 ||
    closeMinutes % 30 !== 0 ||
    closeMinutes <= openMinutes
  ) {
    throw new Error("INVALID_OPERATING_HOURS");
  }
}

export function seoulDateBoundsUtcMs(seoulDate: string): { fromUtcMs: number; toExclusiveUtcMs: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(seoulDate)) throw new Error("INVALID_SEOUL_DATE");
  const fromUtcMs = Date.parse(`${seoulDate}T00:00:00+09:00`);
  if (!Number.isFinite(fromUtcMs)) throw new Error("INVALID_SEOUL_DATE");
  const roundTrip = new Date(fromUtcMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (roundTrip !== seoulDate) throw new Error("INVALID_SEOUL_DATE");
  return { fromUtcMs, toExclusiveUtcMs: fromUtcMs + 24 * 60 * 60 * 1000 };
}
