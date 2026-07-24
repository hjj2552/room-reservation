import { describe, expect, it } from "vitest";
import {
  parseAdminReservation,
  parseAvailability,
  parsePublicReservation,
  parseRecurrencePreview,
  parseReservationFilter,
  parseRoomList,
  parseUpdateSettings,
} from "../../src/http/product-input";

const ROOM_ID = "11111111-1111-4111-8111-111111111111";

function publicBody(overrides: Record<string, unknown> = {}) {
  return {
    roomId: ROOM_ID,
    applicantName: "Applicant",
    applicantEmail: "applicant@example.test",
    applicantPhone: "010-0000-0000",
    purpose: "Purpose",
    startAt: "2026-08-03T10:00:00+09:00",
    endAt: "2026-08-03T11:00:00+09:00",
    cancelPassword: "Aa1!",
    ...overrides,
  };
}

describe("typed HTTP product input", () => {
  it("builds typed reservation commands before service invocation", () => {
    expect(parsePublicReservation(publicBody())).toEqual({
      reservation: {
        roomId: ROOM_ID,
        applicantName: "Applicant",
        applicantEmail: "applicant@example.test",
        applicantPhone: "010-0000-0000",
        purpose: "Purpose",
        startAt: "2026-08-03T10:00:00+09:00",
        endAt: "2026-08-03T11:00:00+09:00",
      },
      password: "Aa1!",
    });
  });

  it.each([
    ["missing field", { applicantName: undefined }],
    ["invalid UUID", { roomId: "not-a-uuid" }],
    ["nonexistent date", { startAt: "2026-02-30T10:00:00+09:00" }],
    ["invalid password", { cancelPassword: "한글1!" }],
  ])("rejects %s at the HTTP input boundary", (_label, override) => {
    expect(() => parsePublicReservation(publicBody(override))).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("rejects invalid reservation enum before service invocation", () => {
    expect(() => parseAdminReservation({ ...publicBody(), status: "UNKNOWN" })).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("parses and validates pagination and booleans", () => {
    expect(parseRoomList(new URLSearchParams("page=2&size=1000&enabled=true"))).toMatchObject({
      page: 2,
      size: 100,
      offset: 200,
      enabled: true,
      includeDeleted: false,
    });
    expect(() => parseRoomList(new URLSearchParams("page=-1"))).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
    expect(() => parseRoomList(new URLSearchParams("enabled=yes"))).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("rejects invalid query dates and missing availability fields", () => {
    expect(() => parseAvailability(new URLSearchParams(`roomId=${ROOM_ID}`))).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
    expect(() => parseAvailability(new URLSearchParams(
      `roomId=${ROOM_ID}&startAt=2026-02-30T10:00:00%2B09:00&endAt=2026-03-01T11:00:00%2B09:00`,
    ))).toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });

  it("rejects recurrence time seconds and invalid conflict policy", () => {
    const recurrence = {
      roomId: ROOM_ID,
      startDate: "2026-08-03",
      endDate: "2026-08-10",
      daysOfWeek: ["MON"],
      startTime: "10:00",
      endTime: "11:00",
      applicantPhone: "010-0000-0000",
      conflictPolicy: "FAIL_ALL",
    };
    expect(() => parseRecurrencePreview({ ...recurrence, startTime: "10:00:01" })).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
    expect(() => parseRecurrencePreview({ ...recurrence, conflictPolicy: "PARTIAL" })).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("rejects settings seconds before the service policy checks", () => {
    const settings = {
      organizationName: "Organization",
      publicNotice: "",
      reservationEnabled: false,
      reservationDisabledMessage: "",
      semesterStartDate: "2026-08-01",
      semesterEndDate: "2026-12-31",
      openTime: "09:00:01",
      closeTime: "18:00",
      slotMinutes: 5,
      availableDaysOfWeek: ["MON"],
      minReservationMinutes: 30,
      maxReservationMinutes: 240,
      adminContactEmail: "admin@example.test",
      adminContactPhone: "",
      completionMessage: "",
      version: 0,
    };
    expect(() => parseUpdateSettings(settings)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("normalizes CSV/list filters without pagination coupling", () => {
    expect(parseReservationFilter(new URLSearchParams(
      `roomId=${ROOM_ID}&status=CONFIRMED&source=ADMIN_MANUAL&excludeCancelled=true&keyword=%20Needle%20`,
    ))).toEqual({
      roomId: ROOM_ID,
      status: "CONFIRMED",
      source: "ADMIN_MANUAL",
      excludeCancelled: true,
      keyword: "needle",
      from: undefined,
      to: undefined,
    });
  });
});
