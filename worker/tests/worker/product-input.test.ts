import { describe, expect, it } from "vitest";
import { normalizeDays } from "../../src/core/domain";
import {
  parseAdminReservation,
  parseAvailability,
  parsePublicReservation,
  parseRecurrenceCreate,
  parseRecurrencePreview,
  parseReservationFilter,
  parseRoomList,
  parseSaveRoomOrder,
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
  it("normalizes weekdays without mutating input and sorts them Monday through Sunday", () => {
    const mixedDays = ["THU", "TUE", "WED"];
    const duplicateDays = ["THU", "TUE", "THU", "WED"];
    const normalizedNames = ["thursday", "tuesday", "Wednesday"];

    expect(normalizeDays(mixedDays)).toEqual(["TUE", "WED", "THU"]);
    expect(normalizeDays(duplicateDays)).toEqual(["TUE", "WED", "THU"]);
    expect(normalizeDays(normalizedNames)).toEqual(["TUE", "WED", "THU"]);
    expect(mixedDays).toEqual(["THU", "TUE", "WED"]);
    expect(duplicateDays).toEqual(["THU", "TUE", "THU", "WED"]);
    expect(normalizedNames).toEqual(["thursday", "tuesday", "Wednesday"]);
    expect(() => normalizeDays(["THU", "FUNDAY"])).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

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

  it("keeps public visibility out of commands and parses admin visibility explicitly", () => {
    expect(parsePublicReservation(publicBody({ showApplicantName: true }))).toEqual(
      parsePublicReservation(publicBody()),
    );
    expect(parseAdminReservation({ ...publicBody(), status: "CONFIRMED" }).reservation.showApplicantName)
      .toBe(false);
    expect(parseAdminReservation({
      ...publicBody(),
      status: "CONFIRMED",
      showApplicantName: true,
    }).reservation.showApplicantName).toBe(true);
    expect(() => parseAdminReservation({
      ...publicBody(),
      status: "CONFIRMED",
      showApplicantName: "true",
    })).toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });

  it.each(["applicantEmail", "applicantPhone"])(
    "keeps public %s required for missing, null, empty, and whitespace values",
    (field) => {
      for (const value of [undefined, null, "", "   "]) {
        expect(() => parsePublicReservation(publicBody({ [field]: value }))).toThrowError(
          expect.objectContaining({ code: "VALIDATION_ERROR" }),
        );
      }
    },
  );

  it("normalizes optional admin contacts and preserves validation for supplied values", () => {
    for (const value of [undefined, null, "", "   "]) {
      const command = parseAdminReservation(publicBody({
        applicantEmail: value,
        applicantPhone: value,
        status: "CONFIRMED",
      }));
      expect(command.reservation.applicantEmail).toBeNull();
      expect(command.reservation.applicantPhone).toBeNull();
    }
    expect(parseAdminReservation(publicBody({
      applicantEmail: "  admin@example.test  ",
      applicantPhone: "  010-1234-5678  ",
      status: "CONFIRMED",
    })).reservation).toMatchObject({
      applicantEmail: "admin@example.test",
      applicantPhone: "010-1234-5678",
    });
    expect(() => parseAdminReservation(publicBody({
      applicantEmail: "invalid-email",
      status: "CONFIRMED",
    }))).toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
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

  it("validates room order version, array size, UUIDs and duplicates before database casts", () => {
    const secondRoomId = "22222222-2222-4222-8222-222222222222";
    expect(parseSaveRoomOrder({
      orderVersion: 3,
      roomIds: [ROOM_ID, secondRoomId],
    })).toEqual({
      orderVersion: 3,
      roomIds: [ROOM_ID, secondRoomId],
    });
    for (const invalid of [
      { orderVersion: -1, roomIds: [ROOM_ID] },
      { orderVersion: 0, roomIds: "not-an-array" },
      { orderVersion: 0, roomIds: ["not-a-uuid"] },
      { orderVersion: 0, roomIds: [ROOM_ID, ROOM_ID] },
    ]) {
      expect(() => parseSaveRoomOrder(invalid)).toThrowError(
        expect.objectContaining({ code: "VALIDATION_ERROR" }),
      );
    }
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

  it("allows missing contacts in recurrence preview and create commands", () => {
    const recurrence = {
      roomId: ROOM_ID,
      startDate: "2026-08-03",
      endDate: "2026-08-10",
      daysOfWeek: ["MON"],
      startTime: "10:00",
      endTime: "11:00",
      conflictPolicy: "FAIL_ALL",
    };
    expect(parseRecurrencePreview(recurrence).applicantPhone).toBeNull();
    expect(parseRecurrenceCreate({
      ...recurrence,
      applicantName: "Applicant",
      purpose: "Purpose",
    })).toMatchObject({ applicantEmail: null, applicantPhone: null, showApplicantName: false });
    expect(parseRecurrenceCreate({
      ...recurrence,
      applicantName: "Applicant",
      purpose: "Purpose",
      showApplicantName: true,
    })).toMatchObject({ showApplicantName: true });
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
