import { describe, expect, it } from "vitest";
import type { RecurrencePreviewCommand } from "../../src/application/product-contracts";
import { datesInRange } from "../../src/core/domain";
import type { Database, Queryable, QueryResult } from "../../src/infra/database";
import { ProductService } from "../../src/services/product-service";

type QueryCall = { text: string; values: unknown[] };

class PreviewDatabase implements Database {
  readonly queries: QueryCall[] = [];

  constructor(
    private readonly conflictIndices: Array<number | string> = [],
    private readonly availableDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
  ) {}

  async query<Row extends Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.queries.push({ text, values });
    let rows: Array<Record<string, unknown>>;
    if (text.includes("FROM rooms")) {
      rows = [{ id: "00000000-0000-4000-8000-000000000001", enabled: true, system_reserved: false }];
    } else if (text.includes("FROM operation_settings")) {
      rows = [{
        organization_name: "Testing",
        public_notice: null,
        reservation_enabled: true,
        reservation_disabled_message: null,
        semester_start_date: "2024-01-01",
        semester_end_date: "2026-12-31",
        open_time: "09:00:00",
        close_time: "18:00:00",
        special_approval_start_time: "16:00:00",
        special_approval_end_time: "18:00:00",
        available_days_of_week: this.availableDays.join(","),
        special_approval_days_of_week: this.availableDays.join(","),
        min_reservation_minutes: 30,
        max_reservation_minutes: 240,
        admin_contact_email: null,
        admin_contact_phone: null,
        completion_message: null,
        version: 0,
      }];
    } else if (text.includes("WITH ORDINALITY")) {
      rows = this.conflictIndices.map((candidate_index) => ({ candidate_index }));
    } else {
      throw new Error(`Unexpected query: ${text}`);
    }
    return { rows: rows as Row[], rowCount: rows.length };
  }

  async transaction<T>(_work: (client: Queryable) => Promise<T>): Promise<T> {
    throw new Error("Transactions are not used by recurrence previews.");
  }
}

function previewCommand(overrides: Partial<RecurrencePreviewCommand> = {}): RecurrencePreviewCommand {
  return {
    roomId: "00000000-0000-4000-8000-000000000001",
    startDate: "2024-01-01",
    endDate: "2024-01-01",
    daysOfWeek: ["MON"],
    startTime: "10:00",
    endTime: "11:00",
    applicantPhone: null,
    conflictPolicy: "FAIL_ALL",
    ...overrides,
  };
}

describe("recurrence preview bounds", () => {
  it("allows one day and exactly 366 inclusive UTC days, including a leap day", () => {
    expect(datesInRange("2024-02-29", "2024-02-29")).toEqual(["2024-02-29"]);
    const dates = datesInRange("2024-02-29", "2025-02-28");
    expect(dates).toHaveLength(366);
    expect(dates.at(-1)).toBe("2025-02-28");
  });

  it("rejects 367 days before any database query and identifies endDate", async () => {
    const database = new PreviewDatabase();
    const products = new ProductService(database, () => new Date("2024-01-01T00:00:00Z"));

    await expect(products.previewRecurrence(previewCommand({
      startDate: "2024-02-29",
      endDate: "2025-03-01",
    }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: [{ field: "endDate" }],
    });
    expect(database.queries).toEqual([]);
  });

  it.each([
    ["invalid format", { startDate: "not-a-date", endDate: "2024-01-01" }, "startDate"],
    ["reversed range", { startDate: "2024-01-02", endDate: "2024-01-01" }, "startDate"],
  ])("rejects %s before any database query", async (_label, dates, field) => {
    const database = new PreviewDatabase();
    const products = new ProductService(database, () => new Date("2024-01-01T00:00:00Z"));

    await expect(products.previewRecurrence(previewCommand(dates))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: [{ field }],
    });
    expect(database.queries).toEqual([]);
  });
});

describe("batched recurrence conflicts", () => {
  it("skips the conflict query when every candidate violates policy", async () => {
    const database = new PreviewDatabase([], ["TUE"]);
    const products = new ProductService(database, () => new Date("2024-01-01T00:00:00Z"));

    const preview = await products.previewRecurrence(previewCommand());

    expect(preview).toMatchObject({
      totalCandidates: 1,
      availableCount: 0,
      conflictCount: 1,
      createAllowed: false,
    });
    expect(preview.items[0]).toMatchObject({
      reason: "OUTSIDE_OPERATING_DAYS",
      message: "The requested day is not available for reservations.",
    });
    expect(database.queries).toHaveLength(2);
    expect(database.queries.some(({ text }) => text.includes("WITH ORDINALITY"))).toBe(false);
  });

  it("maps string ordinality through valid candidate positions without losing item order", async () => {
    const database = new PreviewDatabase(["1", "2", "3"], ["MON", "WED", "FRI"]);
    const products = new ProductService(database, () => new Date("2024-01-01T00:00:00Z"));

    const preview = await products.previewRecurrence(previewCommand({
      endDate: "2024-01-05",
      daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
      conflictPolicy: "SKIP_CONFLICTS",
    }));

    expect(preview.items.map(({ date }) => date)).toEqual([
      "2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05",
    ]);
    expect(preview.items.map(({ reason }) => reason)).toEqual([
      "TIME_SLOT_CONFLICT",
      "OUTSIDE_OPERATING_DAYS",
      "TIME_SLOT_CONFLICT",
      "OUTSIDE_OPERATING_DAYS",
      "TIME_SLOT_CONFLICT",
    ]);
    const conflictQuery = database.queries.filter(({ text }) => text.includes("WITH ORDINALITY"));
    expect(database.queries).toHaveLength(3);
    expect(conflictQuery).toHaveLength(1);
    expect(conflictQuery[0]?.values[1]).toHaveLength(3);
    expect(conflictQuery[0]?.text).toContain("candidate.candidate_index::int");
    expect(conflictQuery[0]?.text).toContain("reservation.status IN ('REQUESTED','CONFIRMED')");
    expect(conflictQuery[0]?.text).toContain("reservation.start_at < candidate.end_at");
    expect(conflictQuery[0]?.text).toContain("reservation.end_at > candidate.start_at");
    expect(preview.createAllowed).toBe(true);
  });

  it("allows SKIP_CONFLICTS when every candidate is a time-slot conflict", async () => {
    const database = new PreviewDatabase(["1"]);
    const products = new ProductService(database, () => new Date("2024-01-01T00:00:00Z"));

    const preview = await products.previewRecurrence(previewCommand({ conflictPolicy: "SKIP_CONFLICTS" }));

    expect(preview).toMatchObject({
      totalCandidates: 1,
      availableCount: 0,
      conflictCount: 1,
      createAllowed: true,
      items: [expect.objectContaining({ available: false, reason: "TIME_SLOT_CONFLICT" })],
    });
  });

  it("uses one conflict query regardless of candidate count and preserves conflict policy totals", async () => {
    const singleDatabase = new PreviewDatabase();
    const single = await new ProductService(singleDatabase, () => new Date("2024-01-01T00:00:00Z"))
      .previewRecurrence(previewCommand());
    expect(single.totalCandidates).toBe(1);
    expect(singleDatabase.queries).toHaveLength(3);

    const failDatabase = new PreviewDatabase(["2"], ["MON", "WED", "FRI"]);
    const failPreview = await new ProductService(failDatabase, () => new Date("2024-01-01T00:00:00Z"))
      .previewRecurrence(previewCommand({
        endDate: "2024-01-05",
        daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
      }));
    const skipDatabase = new PreviewDatabase(["2"], ["MON", "WED", "FRI"]);
    const skipPreview = await new ProductService(skipDatabase, () => new Date("2024-01-01T00:00:00Z"))
      .previewRecurrence(previewCommand({
        endDate: "2024-01-05",
        daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
        conflictPolicy: "SKIP_CONFLICTS",
      }));

    expect(failDatabase.queries).toHaveLength(3);
    expect(skipDatabase.queries).toHaveLength(3);
    expect(failPreview).toMatchObject({ totalCandidates: 5, availableCount: 2, conflictCount: 3, createAllowed: false });
    expect(skipPreview).toMatchObject({ totalCandidates: 5, availableCount: 2, conflictCount: 3, createAllowed: true });
  });
});
