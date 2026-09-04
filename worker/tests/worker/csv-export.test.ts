import { describe, expect, it } from "vitest";
import type { ReservationFilterQuery } from "../../src/application/product-contracts";
import { AppError } from "../../src/core/errors";
import { mapApplicationError } from "../../src/http/errors";
import type { Database, Queryable, QueryResult } from "../../src/infra/database";
import { ProductService } from "../../src/services/product-service";

type Row = Record<string, unknown>;

const filter: ReservationFilterQuery = {
  status: "CONFIRMED",
  keyword: "needle",
  excludeCancelled: false,
};

function reservationRow(overrides: Row = {}): Row {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    room_id: "00000000-0000-4000-8000-000000000002",
    current_room_name: "Normal room",
    original_room_name: null,
    applicant_name: "Normal applicant",
    applicant_email: "normal@example.test",
    applicant_phone: "010-0000-0000",
    show_applicant_name: true,
    purpose: "Normal purpose",
    recurrence_id: null,
    tag_name: null,
    tag_color: null,
    recurrence_exception: false,
    start_at: "2026-01-01T00:00:00Z",
    end_at: "2026-01-01T01:00:00Z",
    status: "CONFIRMED",
    source: "ADMIN_MANUAL",
    created_at: "2026-01-01T02:00:00Z",
    ...overrides,
  };
}

class CsvDatabase implements Database {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];

  constructor(private readonly rows: Row[]) {}

  async query<ResultRow extends Row>(text: string, values: unknown[] = []): Promise<QueryResult<ResultRow>> {
    this.calls.push({ text, values });
    return { rows: this.rows as ResultRow[], rowCount: this.rows.length };
  }

  async transaction<T>(_work: (client: Queryable) => Promise<T>): Promise<T> {
    throw new Error("CSV export does not use transactions.");
  }
}

describe("reservation CSV export bounds", () => {
  it("exports 10,000 rows with the existing filter and ordering contract", async () => {
    const database = new CsvDatabase(Array(10_000).fill(reservationRow()));
    const csv = await new ProductService(database, () => new Date("2026-01-01T00:00:00Z")).exportReservationsCsv(filter);

    expect(csv.split("\r\n")).toHaveLength(10_002);
    expect(database.calls).toHaveLength(1);
    expect(database.calls[0]?.text).toContain("WHERE r.status = $1::reservation_status");
    expect(database.calls[0]?.text).toContain("lower(r.applicant_name) LIKE $2");
    expect(database.calls[0]?.text).toContain("ORDER BY r.start_at ASC LIMIT 10001");
    expect(database.calls[0]?.values).toEqual(["CONFIRMED", "%needle%", "%needle%", "%needle%", "%needle%"]);
  });

  it("rejects 10,001 rows before touching a row or serializing CSV", async () => {
    const poison = new Proxy({}, {
      get() {
        throw new Error("row serialization must not run");
      },
    });
    const database = new CsvDatabase(Array(10_001).fill(poison));

    const error = await new ProductService(database, () => new Date("2026-01-01T00:00:00Z"))
      .exportReservationsCsv(filter).catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      kind: "POLICY_VIOLATION",
      code: "CSV_EXPORT_TOO_LARGE",
      message: "Too many reservations to export. Narrow the filters and try again.",
    });
    expect(mapApplicationError(error as AppError).status).toBe(422);
    expect(database.calls).toHaveLength(1);
  });
});

describe("reservation CSV formula neutralization", () => {
  it("neutralizes every untrusted data cell before preserving CSV quoting", async () => {
    const database = new CsvDatabase([reservationRow({
      id: "=identifier",
      current_room_name: "=Room",
      applicant_name: "  +CMD",
      applicant_email: "\t@SUM(1,1)",
      applicant_phone: "-01000000000",
      purpose: " \t=SUM(\"x\",1)\nnext",
      recurrence_id: "'ordinary",
      source: "\r@source",
    })]);

    const csv = await new ProductService(database, () => new Date("2026-01-01T00:00:00Z")).exportReservationsCsv(filter);

    expect(csv.startsWith("\uFEFFreservationId,roomName,applicantName,applicantEmail,applicantPhone,purpose,startAt,endAt,status,source,recurrenceId,createdAt\r\n")).toBe(true);
    expect(csv).toContain("'=identifier,'=Room,'  +CMD");
    expect(csv).toContain("\"'\t@SUM(1,1)\"");
    expect(csv).toContain("'-01000000000");
    expect(csv).toContain("\"' \t=SUM(\"\"x\"\",1)\nnext\"");
    expect(csv).toContain(",CONFIRMED,\"'\r@source\",'ordinary,");
    expect(csv).toContain("2026-01-01 09:00:00,2026-01-01 10:00:00");
  });

  it("leaves normal text and already-apostrophized text unchanged", async () => {
    const csv = await new ProductService(new CsvDatabase([reservationRow({
      purpose: "Normal, \"quoted\"\r\nline",
      recurrence_id: "'already safe",
    })]), () => new Date("2026-01-01T00:00:00Z")).exportReservationsCsv(filter);

    expect(csv).toContain("\"Normal, \"\"quoted\"\"\r\nline\"");
    expect(csv).toContain(",'already safe,");
    expect(csv).not.toContain("''already safe");
  });
});
