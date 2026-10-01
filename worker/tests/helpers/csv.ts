import type { Database, Queryable, QueryResult } from "../../src/infra/database";

type Row = Record<string, unknown>;

export function reservationRow(overrides: Row = {}): Row {
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

export class CsvDatabase implements Database {
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
