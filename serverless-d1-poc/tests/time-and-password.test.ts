import { describe, expect, it } from "vitest";
import {
  MIN_RESERVATION_MS,
  TIMETABLE_GRID_MS,
  parseUtcInstant,
  seoulDateBoundsUtcMs,
  validateOperatingHours,
  validateReservationWindow,
} from "../src/core/time-policy";
import { hashPublicPassword, verifyPublicPassword } from "../src/security/web-crypto";

describe("time policy and PBKDF2 in workerd", () => {
  it("stores equivalent UTC/KST instants losslessly and queries Seoul dates with half-open bounds", () => {
    const utc = Date.parse("2030-01-01T01:00:00Z");
    const kst = Date.parse("2030-01-01T10:00:00+09:00");
    expect(kst).toBe(utc);
    expect(parseUtcInstant("2030-01-01T01:00:00Z")).toBe(utc);
    expect(parseUtcInstant("2030-01-01T10:00:00+09:00")).toBe(utc);
    expect(() => parseUtcInstant("2030-01-01T10:00:00")).toThrow("UTC_OFFSET_REQUIRED");
    expect(Number.isSafeInteger(kst)).toBe(true);
    expect(seoulDateBoundsUtcMs("2030-01-01")).toEqual({
      fromUtcMs: Date.parse("2030-01-01T00:00:00+09:00"),
      toExclusiveUtcMs: Date.parse("2030-01-02T00:00:00+09:00"),
    });
    expect(() => seoulDateBoundsUtcMs("2030-02-30")).toThrow("INVALID_SEOUL_DATE");
  });

  it("preserves five-minute, 30-minute, public-past, and admin-past policies", () => {
    const now = Date.parse("2030-01-01T10:00:00+09:00");
    const valid = { startAtUtcMs: now, endAtUtcMs: now + MIN_RESERVATION_MS };
    expect(() => validateReservationWindow(valid, now, "public")).not.toThrow();
    expect(() =>
      validateReservationWindow({ ...valid, startAtUtcMs: valid.startAtUtcMs + 60_000 }, now, "public"),
    ).toThrow("NOT_ON_FIVE_MINUTE_GRID");
    expect(() =>
      validateReservationWindow({ ...valid, endAtUtcMs: valid.startAtUtcMs + 25 * 60_000 }, now, "public"),
    ).toThrow("INVALID_DURATION");
    expect(() =>
      validateReservationWindow(
        { startAtUtcMs: now - 60 * 60_000, endAtUtcMs: now - 30 * 60_000 },
        now,
        "public",
      ),
    ).toThrow("PAST_RESERVATION");
    expect(() =>
      validateReservationWindow(
        { startAtUtcMs: now - 60 * 60_000, endAtUtcMs: now - 30 * 60_000 },
        now,
        "admin",
      ),
    ).not.toThrow();
    expect(TIMETABLE_GRID_MS).toBe(30 * 60_000);
    expect(() => validateOperatingHours(9 * 60, 18 * 60)).not.toThrow();
    expect(() => validateOperatingHours(9 * 60 + 15, 18 * 60)).toThrow("INVALID_OPERATING_HOURS");
  });

  it("hashes and verifies PBKDF2-HMAC-SHA256 at 600,000 iterations and records wall time", async () => {
    const hashStarted = performance.now();
    const encoded = await hashPublicPassword("testing-reservation-password");
    const hashWallMs = performance.now() - hashStarted;
    const verifyStarted = performance.now();
    const verified = await verifyPublicPassword("testing-reservation-password", encoded);
    const verifyWallMs = performance.now() - verifyStarted;
    expect(encoded).toMatch(/^pbkdf2-sha256\$600000\$/);
    expect(verified).toBe(true);
    expect(await verifyPublicPassword("wrong", encoded)).toBe(false);
    console.log(JSON.stringify({ pbkdf2: { hashWallMs, verifyWallMs, iterations: 600000 } }));
  });
});
