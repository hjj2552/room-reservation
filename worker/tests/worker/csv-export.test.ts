import { describe, expect, it } from "vitest";
import type { ReservationFilterQuery } from "../../src/application/product-contracts";
import { AppError } from "../../src/core/errors";
import { mapApplicationError } from "../../src/http/errors";
import { CsvDatabase, reservationRow } from "../helpers/csv";
import { ProductService } from "../../src/services/product-service";

const filter: ReservationFilterQuery = {
  status: "CONFIRMED",
  keyword: "needle",
  excludeCancelled: false,
};

describe("reservation CSV date and empty output", () => {
  const header = "\uFEFFreservationId,roomName,applicantName,applicantEmail,applicantPhone,purpose,startAt,endAt,status,source,recurrenceId,createdAt\r\n";

  it("preserves complete CSV output at KST midnight, year boundaries and second precision", async () => {
    const rows = [reservationRow({
      start_at: "2026-12-31T14:59:59Z", end_at: new Date("2026-12-31T15:00:00Z"),
      created_at: "2025-12-31T15:00:07Z",
    }), reservationRow({
      start_at: new Date("2026-06-30T14:59:58.999Z"), end_at: "2026-06-30T15:00:09Z",
      created_at: new Date("2026-01-01T00:00:01+09:00"),
    })];
    const csv = await new ProductService(new CsvDatabase(rows), () => new Date()).exportReservationsCsv(filter);
    const prefix = "00000000-0000-4000-8000-000000000001,Normal room,Normal applicant,normal@example.test,010-0000-0000,Normal purpose,";
    expect(csv).toBe(header
      + prefix + "2026-12-31 23:59:59,2027-01-01 00:00:00,CONFIRMED,ADMIN_MANUAL,,2026-01-01 00:00:07\r\n"
      + prefix + "2026-06-30 23:59:58,2026-07-01 00:00:09,CONFIRMED,ADMIN_MANUAL,,2026-01-01 00:00:01\r\n");
  });

  it("keeps the BOM, header and single CRLF for an empty result", async () => {
    expect(await new ProductService(new CsvDatabase([]), () => new Date()).exportReservationsCsv(filter)).toBe(header);
  });

  it("creates one formatter per export and does not share it across calls", async () => {
    const original = Intl.DateTimeFormat;
    let constructions = 0;
    Intl.DateTimeFormat = new Proxy(original, { construct(target, args) {
      constructions += 1;
      return Reflect.construct(target, args);
    } });
    try {
      const service = new ProductService(new CsvDatabase(Array(3).fill(reservationRow())), () => new Date());
      const first = await service.exportReservationsCsv(filter);
      expect(constructions).toBe(1);
      expect(await service.exportReservationsCsv(filter)).toBe(first);
      expect(constructions).toBe(2);
    } finally {
      Intl.DateTimeFormat = original;
    }
  });

  it.each(["start_at", "end_at", "created_at"])("preserves invalid %s rejection for string and Date input", async field => {
    for (const input of ["invalid-date", new Date(NaN)]) {
      await expect(new ProductService(new CsvDatabase([reservationRow({ [field]: input })]), () => new Date())
        .exportReservationsCsv(filter)).rejects.toThrow(RangeError);
    }
  });
});

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
