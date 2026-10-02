import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { Database, Queryable } from "../../src/infra/database";
import { ProductService } from "../../src/services/product-service";
import { PgDatabase } from "./pg-database";
import { recurrenceNow, recurrenceQueryCounts, setupRecurrenceFixture } from "./recurrence-fixture";

const statements: string[] = [];
const database = new PgDatabase(process.env.DATABASE_URL!, sql => statements.push(sql));
let fixture: Awaited<ReturnType<typeof setupRecurrenceFixture>>;
beforeAll(async () => { fixture = await setupRecurrenceFixture(database); });
beforeEach(async () => { await fixture.clear(); statements.length = 0; });
afterAll(async () => { try { await fixture?.close(); } finally { await database.close(); } });

function interceptedService(wrap: (client: Queryable) => Queryable, beforeTransaction?: () => Promise<void>) {
  const intercepted: Database = {
    query: (sql, values) => database.query(sql, values),
    transaction: async work => {
      await beforeTransaction?.();
      return database.transaction(client => work(wrap(client)));
    },
  };
  return new ProductService(intercepted, () => recurrenceNow);
}

async function expectRolledBack() {
  for (const [table, column] of [
    ["reservation_recurrences", "purpose"], ["reservations", "purpose"],
    ["reservation_histories", "reservation_purpose"],
  ]) {
    expect((await database.query(`SELECT 1 FROM ${table} WHERE ${column}=$1`, [fixture.purpose])).rows).toEqual([]);
  }
}

it.each(["FAIL_ALL", "SKIP_CONFLICTS"])("%s preserves every generated reservation and history with one room name lookup", async policy => {
  const result = await fixture.products.createRecurrence(fixture.command(30, policy), "testing-admin");
  const counts = recurrenceQueryCounts(statements);
  expect(counts).toMatchObject({ roomName: 1, savepoint: policy === "FAIL_ALL" ? 0 : 30,
    release: policy === "FAIL_ALL" ? 0 : 30, rollbackTo: 0 });
  expect(result).toMatchObject({ createdCount: 30, cancelledCount: 0, skippedCount: 0, failedCount: 0, totalCandidates: 30 });
  expect(result.items.every(item => item.status === "CREATED" && item.reason === null)).toBe(true);
  const rows = (await database.query(
    `SELECT r.*, h.action, h.after_status, h.before_status, h.memo, h.actor_type, h.actor_id,
       h.reservation_room_name, h.reservation_room_id, h.before_reservation_room_name,
       h.reservation_start_at, h.reservation_end_at, h.reservation_purpose,
       h.reservation_applicant_name, h.reservation_applicant_email, h.reservation_applicant_phone,
       h.reservation_show_applicant_name
     FROM reservations r JOIN reservation_histories h ON h.reservation_id=r.id
     WHERE r.recurrence_id=$1 ORDER BY r.start_at`, [result.recurrenceId],
  )).rows;
  expect(rows).toHaveLength(30);
  for (const row of rows) {
    expect(row).toMatchObject({ room_id: fixture.room.id, status: "CONFIRMED", source: "RECURRING_GENERATED",
      purpose: fixture.purpose, applicant_name: "testing-recurring-applicant", applicant_email: null,
      applicant_phone: "01012345678", show_applicant_name: true, recurrence_exception: false,
      action: "RECURRENCE_GENERATED", before_status: null, after_status: "CONFIRMED", memo: null,
      actor_type: "ADMIN", actor_id: "testing-admin", reservation_room_name: fixture.room.name,
      reservation_room_id: fixture.room.id, before_reservation_room_name: null,
      reservation_purpose: fixture.purpose, reservation_applicant_name: "testing-recurring-applicant",
      reservation_applicant_email: null, reservation_applicant_phone: "01012345678", reservation_show_applicant_name: true });
    expect(row.reservation_start_at).toEqual(row.start_at);
    expect(row.reservation_end_at).toEqual(row.end_at);
  }
});

it("FAIL_ALL rolls back parent, earlier children and histories on a real insert-time exclusion conflict", async () => {
  const products = interceptedService(client => client, () => fixture.blocker(1));
  await expect(products.createRecurrence(fixture.command(3), "testing-admin"))
    .rejects.toMatchObject({ kind: "CONFLICT", code: "TIME_SLOT_CONFLICT" });
  expect(statements.filter(sql => sql.includes("INSERT INTO reservation_histories"))).toHaveLength(1);
  expect(statements.filter(sql => sql === "ROLLBACK")).toHaveLength(1);
  expect(recurrenceQueryCounts(statements)).toMatchObject({ savepoint: 0, release: 0, rollbackTo: 0 });
  await expectRolledBack();
  expect((await database.query("SELECT 1 FROM reservations WHERE room_id=$1", [fixture.room.id])).rows).toHaveLength(1);
});

it.each(["FAIL_ALL", "SKIP_CONFLICTS"])("%s rolls back all records on a non-conflict database error in a later history", async policy => {
  let history = 0;
  const products = interceptedService(client => ({ query: async (sql, values) => {
    if (sql.includes("INSERT INTO reservation_histories") && ++history === 2) {
      // A real PostgreSQL error after one child/history and the second child were inserted.
      await client.query("SELECT 1 / 0");
    }
    return client.query(sql, values);
  } }));
  await expect(products.createRecurrence(fixture.command(3, policy), "testing-admin"))
    .rejects.toMatchObject({ code: "22012" });
  expect(history).toBe(2);
  expect(statements.filter(sql => sql === "ROLLBACK")).toHaveLength(1);
  await expectRolledBack();
});

it("SKIP_CONFLICTS retains savepoint recovery, cancelled histories and subsequent occurrences on an insert race", async () => {
  const products = interceptedService(client => client, () => fixture.blocker(1));
  const result = await products.createRecurrence(fixture.command(3, "SKIP_CONFLICTS"), "testing-admin");
  expect(recurrenceQueryCounts(statements)).toMatchObject({ roomName: 1, savepoint: 3, release: 3, rollbackTo: 1 });
  expect(result).toMatchObject({ createdCount: 2, cancelledCount: 1, skippedCount: 0, failedCount: 0 });
  expect(result.items.map(item => [item.status, item.reason])).toEqual([
    ["CREATED", null], ["CANCELLED", "TIME_SLOT_CONFLICT"], ["CREATED", null],
  ]);
  const rows = (await database.query(
    `SELECT r.status,h.after_status,h.memo,h.reservation_room_name FROM reservations r
     JOIN reservation_histories h ON h.reservation_id=r.id WHERE r.recurrence_id=$1 ORDER BY r.start_at`,
    [result.recurrenceId],
  )).rows;
  expect(rows).toEqual([
    { status: "CONFIRMED", after_status: "CONFIRMED", memo: null, reservation_room_name: fixture.room.name },
    { status: "CANCELLED", after_status: "CANCELLED", memo: "반복 예약 생성 시 시간 충돌로 취소 상태 기록", reservation_room_name: fixture.room.name },
    { status: "CONFIRMED", after_status: "CONFIRMED", memo: null, reservation_room_name: fixture.room.name },
  ]);
});

it("uses a transaction-local name snapshot even if another connection renames the room mid-creation", async () => {
  let history = 0;
  const products = interceptedService(client => ({ query: async <Row extends Record<string, unknown>>(sql: string, values?: unknown[]) => {
    const result = await client.query<Row>(sql, values);
    if (sql.includes("INSERT INTO reservation_histories") && ++history === 1) {
      await database.query("UPDATE rooms SET name=$2 WHERE id=$1", [fixture.room.id, `${fixture.room.name}-renamed`]);
    }
    return result;
  } }));
  try {
    const result = await products.createRecurrence(fixture.command(3), "testing-admin");
    expect(recurrenceQueryCounts(statements).roomName).toBe(1);
    expect((await database.query(
      "SELECT reservation_room_name FROM reservation_histories WHERE reservation_purpose=$1", [fixture.purpose],
    )).rows).toEqual(Array.from({ length: 3 }, () => ({ reservation_room_name: fixture.room.name })));
    // A later operation must resolve the new name, with no cache shared across requests.
    await fixture.clear();
    const next = await fixture.products.createRecurrence(fixture.command(1), "testing-admin");
    expect(next.recurrenceId).not.toBe(result.recurrenceId);
    expect((await database.query(
      "SELECT reservation_room_name FROM reservation_histories WHERE reservation_purpose=$1", [fixture.purpose],
    )).rows).toEqual([{ reservation_room_name: `${fixture.room.name}-renamed` }]);
  } finally {
    await database.query("UPDATE rooms SET name=$2 WHERE id=$1", [fixture.room.id, fixture.room.name]);
  }
});
