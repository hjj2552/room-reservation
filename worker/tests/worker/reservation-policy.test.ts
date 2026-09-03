import { describe, expect, it } from "vitest";
import type { OperationSettings, ReservationInput } from "../../src/core/domain";
import { validateReservationPolicy } from "../../src/core/domain";

const settings: OperationSettings = {
  organizationName: "Test",
  publicNotice: null,
  reservationEnabled: true,
  reservationDisabledMessage: null,
  semesterStartDate: "2026-07-01",
  semesterEndDate: "2026-07-31",
  openTime: "09:00",
  closeTime: "18:00",
  publicOpenTime: "10:00",
  publicCloseTime: "17:00",
  slotMinutes: 5,
  availableDaysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
  publicAvailableDaysOfWeek: ["TUE", "WED", "THU"],
  minReservationMinutes: 30,
  maxReservationMinutes: 240,
  adminContactEmail: null,
  adminContactPhone: null,
  completionMessage: null,
  version: 1,
};

function reservation(startAt: string, endAt: string): ReservationInput {
  return {
    roomId: "11111111-1111-4111-8111-111111111111",
    applicantName: "Applicant",
    applicantEmail: "applicant@example.test",
    applicantPhone: "01012345678",
    purpose: "Purpose",
    startAt,
    endAt,
  };
}

describe("public reservation operating policy", () => {
  it("allows general and separate-confirmation times inside the operating schedule", () => {
    const now = new Date("2026-07-01T00:00:00Z");

    expect(() => validateReservationPolicy(true, settings, reservation(
      "2026-07-14T10:00:00+09:00",
      "2026-07-14T10:30:00+09:00",
    ), "PUBLIC", now)).not.toThrow();
    expect(() => validateReservationPolicy(true, settings, reservation(
      "2026-07-13T09:00:00+09:00",
      "2026-07-13T09:30:00+09:00",
    ), "PUBLIC", now)).not.toThrow();
  });

  it("still rejects times outside operating days and hours", () => {
    const now = new Date("2026-07-01T00:00:00Z");

    expect(() => validateReservationPolicy(true, settings, reservation(
      "2026-07-12T10:00:00+09:00",
      "2026-07-12T10:30:00+09:00",
    ), "PUBLIC", now)).toThrowError(expect.objectContaining({ code: "OUTSIDE_OPERATING_DAYS" }));
    expect(() => validateReservationPolicy(true, settings, reservation(
      "2026-07-14T08:30:00+09:00",
      "2026-07-14T09:00:00+09:00",
    ), "PUBLIC", now)).toThrowError(expect.objectContaining({ code: "OUTSIDE_OPERATING_HOURS" }));
  });
});
