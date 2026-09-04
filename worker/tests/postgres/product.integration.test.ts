import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProductService } from "../../src/services/product-service";
import { SessionService } from "../../src/services/session-service";
import { createHttpApp } from "../../src/http/app";
import { parseRuntimeConfig } from "../../src/core/config";
import { AppError } from "../../src/core/errors";
import type { Database } from "../../src/infra/database";
import {
  parseAdminReservation,
  parsePublicPassword,
  parsePublicReservation,
  parseRecurrenceCreate,
  parseRecurrenceList,
  parseReservationFilter,
  parseTagList,
  parseUpdateSettings,
} from "../../src/http/product-input";
import { PgDatabase } from "./pg-database";
import { allowAllRateLimiter, fixedClientIpResolver } from "../helpers/rate-limit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const database = new PgDatabase(databaseUrl);
const products = new ProductService(database, () => new Date());
const sessions = new SessionService(database, () => new Date());

function futureWeekday(daysAhead: number, hour: number) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + daysAhead);
  while (kst.getUTCDay() === 0 || kst.getUTCDay() === 6) kst.setUTCDate(kst.getUTCDate() + 1);
  return `${kst.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00+09:00`;
}

function addHour(value: string) {
  const date = new Date(value);
  date.setUTCHours(date.getUTCHours() + 1);
  return `${new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19)}+09:00`;
}

function weekStartFor(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function publicPayload(roomId: string, password: string, purpose: string, hour = 10) {
  const startAt = futureWeekday(21, hour);
  return {
    roomId,
    applicantName: "testing-public-user",
    applicantEmail: `testing-${purpose.replace(/[^a-z0-9]/gi, "-")}@example.test`,
    applicantPhone: "010-1234-5678",
    purpose,
    startAt,
    endAt: addHour(startAt),
    cancelPassword: password,
  };
}

async function waitForPublicMutationWaiters(expected: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await database.query(
      `SELECT count(*)::int AS count
       FROM pg_stat_activity
       WHERE datname=current_database() AND pid <> pg_backend_pid()
         AND state='active' AND wait_event_type='Lock'
         AND query LIKE '%cancel_password_hash = crypt%'
         AND query LIKE '%FOR UPDATE OF r%'`,
    );
    if (Number(result.rows[0]?.count) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${expected} public reservation mutation lock waiter(s).`);
}

async function runQueuedPublicMutations(
  reservationId: string,
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
) {
  const blocker = await database.pool.connect();
  const pending: Promise<unknown>[] = [];
  let transactionOpen = false;
  try {
    await blocker.query("BEGIN");
    transactionOpen = true;
    await blocker.query("SELECT id FROM reservations WHERE id=$1 FOR UPDATE", [reservationId]);
    pending.push(first());
    await waitForPublicMutationWaiters(1);
    pending.push(second());
    await waitForPublicMutationWaiters(2);
    await blocker.query("COMMIT");
    transactionOpen = false;
    return await Promise.allSettled(pending);
  } finally {
    if (transactionOpen) await blocker.query("ROLLBACK");
    await Promise.allSettled(pending);
    blocker.release();
  }
}

beforeAll(async () => {
  await database.query("DELETE FROM admin_sessions");
  await database.query("DELETE FROM reservation_histories");
  await database.query("DELETE FROM reservations");
  await database.query("DELETE FROM reservation_recurrences");
  await database.query("DELETE FROM tags");
  await database.query("DELETE FROM rooms WHERE system_reserved=false");
  await database.query("UPDATE room_order_state SET version=0 WHERE id=1");
  await database.query(
    `UPDATE operation_settings SET reservation_enabled=true,
      semester_start_date=(current_date - interval '1 day')::date,
      semester_end_date=(current_date + interval '180 days')::date,
      open_time='09:00', close_time='18:00', available_days_of_week='MON,TUE,WED,THU,FRI',
      public_open_time='09:00', public_close_time='18:00',
      public_available_days_of_week='MON,TUE,WED,THU,FRI', version=0`,
  );
});

afterAll(async () => {
  await database.close();
});

describe("Worker migrations", () => {
  it("starts from the Worker baseline without legacy migration tables and has required system data", async () => {
    const columns = await database.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='operation_settings'`,
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain("slot_minutes");
    const tables = await database.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    );
    expect(tables.rows.map((row) => row.table_name)).not.toContain("admins");
    expect(tables.rows.map((row) => row.table_name)).not.toContain("flyway_schema_history");
    const sentinel = await database.query("SELECT name FROM rooms WHERE system_reserved=true");
    expect(sentinel.rows).toEqual([{ name: "삭제된 공간" }]);
  });

  it("keeps the V5 recurrence cleanup and applies the V6 and V7 schema contracts", async () => {
    const schema = await database.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public'
             AND table_name='reservation_recurrences'
             AND column_name='deleted_at'
             AND is_nullable='YES'
         ) AS deleted_at_exists,
         EXISTS (
           SELECT 1 FROM pg_indexes
           WHERE schemaname='public'
             AND tablename='reservation_recurrences'
             AND indexname='idx_recurrences_deleted_at'
         ) AS deleted_at_index_exists`,
    );
    expect(schema.rows[0]).toEqual({
      deleted_at_exists: false,
      deleted_at_index_exists: false,
    });
    const ledger = await database.query("SELECT name FROM worker_migrations ORDER BY run_on ASC, id ASC");
    expect(ledger.rows.map((row) => row.name)).toEqual([
      "001_worker_baseline_v1",
      "002_room_display_order_v2",
      "003_admin_optional_contact_v3",
      "004_applicant_name_visibility_v4",
      "005_recurrence_hard_delete_v5",
      "006_public_reservation_schedule_v6",
      "007_applicant_phone_normalization_v7",
    ]);
    const settings = await database.query(
      `SELECT open_time::text, close_time::text, available_days_of_week,
        public_open_time::text, public_close_time::text, public_available_days_of_week
       FROM operation_settings WHERE id=1`,
    );
    expect(settings.rows[0]).toEqual({
      open_time: "09:00:00",
      close_time: "18:00:00",
      available_days_of_week: "MON,TUE,WED,THU,FRI",
      public_open_time: "09:00:00",
      public_close_time: "18:00:00",
      public_available_days_of_week: "MON,TUE,WED,THU,FRI",
    });
    const phoneConstraints = await database.query(
      `SELECT conname FROM pg_constraint
       WHERE conname IN (
         'chk_reservations_applicant_phone_digits',
         'chk_recurrences_applicant_phone_digits',
         'chk_histories_reservation_applicant_phone_digits',
         'chk_histories_before_reservation_applicant_phone_digits'
       ) ORDER BY conname`,
    );
    expect(phoneConstraints.rows).toHaveLength(4);
  });

  it("rolls transactions back", async () => {
    await expect(database.transaction(async (client) => {
      await client.query("INSERT INTO tags(name,color) VALUES('testing-rollback','#112233')");
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect((await database.query("SELECT 1 FROM tags WHERE name='testing-rollback'")).rows).toHaveLength(0);
  });

  it("enforces configured reservation duration in PostgreSQL", async () => {
    const room = await products.createRoom({
      name: "testing-room-db-policy", location: null, capacity: 2, description: null, enabled: true,
    });
    const startAt = futureWeekday(25, 10);
    await expect(database.query(
      `INSERT INTO reservations (
        room_id, applicant_name, applicant_email, purpose, start_at, end_at,
        status, source, created_by_actor_type, cancel_password_hash
       ) VALUES ($1, 'testing-db-policy', 'testing-db-policy@example.test', 'testing-db-policy',
        $2, $3, 'REQUESTED', 'PUBLIC_FORM', 'PUBLIC_USER', crypt('Db1!', gen_salt('bf', 12)))`,
      [room.id, startAt, new Date(new Date(startAt).getTime() + 25 * 60_000).toISOString()],
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("applies the V3 nullable email contract without removing the email index", async () => {
    const columns = await database.query(
      `SELECT table_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name IN ('reservations','reservation_recurrences')
         AND column_name='applicant_email'
       ORDER BY table_name`,
    );
    expect(columns.rows).toEqual([
      { table_name: "reservation_recurrences", is_nullable: "YES" },
      { table_name: "reservations", is_nullable: "YES" },
    ]);
    const constraints = await database.query(
      `SELECT conname FROM pg_constraint
       WHERE conname IN (
         'chk_reservations_applicant_email_optional',
         'chk_recurrences_applicant_email_optional',
         'chk_reservations_applicant_email_not_blank',
         'chk_recurrences_applicant_email_not_blank'
       ) ORDER BY conname`,
    );
    expect(constraints.rows).toEqual([
      { conname: "chk_recurrences_applicant_email_optional" },
      { conname: "chk_reservations_applicant_email_optional" },
    ]);
    expect((await database.query(
      "SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_reservations_applicant_email'",
    )).rows).toHaveLength(1);
  });

  it("applies the V4 applicant name visibility defaults and public reservation constraint", async () => {
    const columns = await database.query(
      `SELECT table_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name IN ('reservations','reservation_recurrences')
         AND column_name='show_applicant_name'
       ORDER BY table_name`,
    );
    expect(columns.rows).toEqual([
      { table_name: "reservation_recurrences", is_nullable: "NO", column_default: "false" },
      { table_name: "reservations", is_nullable: "NO", column_default: "false" },
    ]);
    expect((await database.query(
      `SELECT 1 FROM pg_constraint
       WHERE conname='chk_reservations_public_applicant_name_hidden'`,
    )).rows).toHaveLength(1);

    const roomId = await insertRoom("testing-room-v4-public-constraint");
    const startAt = futureWeekday(28, 10);
    await expect(database.query(
      `INSERT INTO reservations(
         room_id,applicant_name,applicant_email,applicant_phone,purpose,start_at,end_at,
         status,source,created_by_actor_type,show_applicant_name
       ) VALUES($1,'testing-v4-public','testing-v4@example.test','01000000000',
         'testing-v4-public',$2,$3,'REQUESTED','PUBLIC_FORM','PUBLIC_USER',true)`,
      [roomId, startAt, addHour(startAt)],
    )).rejects.toMatchObject({ code: "23514" });
  });
});

describe("room display order V2", () => {
  const roomCommand = (
    name: string,
    overrides: Partial<{ location: string | null; capacity: number; description: string | null; enabled: boolean }> = {},
  ) => ({
    name,
    location: overrides.location ?? null,
    capacity: overrides.capacity ?? 10,
    description: overrides.description ?? null,
    enabled: overrides.enabled ?? true,
  });

  it("enforces positive unique orders for ordinary rooms and excludes the system room", async () => {
    await resetProductData();
    const first = await products.createRoom(roomCommand("testing-room-constraint-a"));
    const sentinel = await database.query("SELECT display_order FROM rooms WHERE system_reserved=true");
    expect(sentinel.rows).toEqual([{ display_order: null }]);
    await expect(database.query(
      "INSERT INTO rooms(name,capacity,enabled) VALUES('testing-room-order-missing',10,true)",
    )).rejects.toMatchObject({ code: "23514" });
    await expect(database.query(
      `INSERT INTO rooms(name,capacity,enabled,display_order)
       VALUES('testing-room-order-duplicate',10,true,$1)`,
      [first.displayOrder],
    )).rejects.toMatchObject({ code: "23505" });
  });

  it("uses MAX + 1 across empty, middle-delete, last-delete and same-name recreation cases", async () => {
    await resetProductData();
    const first = await products.createRoom(roomCommand("testing-room-order-a"));
    const second = await products.createRoom(roomCommand("testing-room-order-b"));
    const third = await products.createRoom(roomCommand("testing-room-order-c"));
    const fourth = await products.createRoom(roomCommand("testing-room-order-d"));
    expect([first.displayOrder, second.displayOrder, third.displayOrder, fourth.displayOrder]).toEqual([1, 2, 3, 4]);

    await products.deleteRoom(second.id);
    const afterMiddleDelete = await products.createRoom(roomCommand("testing-room-order-e"));
    expect(afterMiddleDelete.displayOrder).toBe(5);

    await products.deleteRoom(afterMiddleDelete.id);
    const afterLastDelete = await products.createRoom(roomCommand("testing-room-order-f"));
    expect(afterLastDelete.displayOrder).toBe(5);

    await products.deleteRoom(first.id);
    const recreated = await products.createRoom(roomCommand("testing-room-order-a"));
    expect(recreated.displayOrder).toBe(6);
  });

  it("preserves order and version across disable, edit and re-enable, then normalizes a saved order", async () => {
    await resetProductData();
    const a = await products.createRoom(roomCommand("testing-room-policy-a", { description: "A", enabled: true }));
    const b = await products.createRoom(roomCommand("testing-room-policy-b", { description: "B", enabled: true }));
    const c = await products.createRoom(roomCommand("testing-room-policy-c"));
    const d = await products.createRoom(roomCommand("testing-room-policy-d"));
    const beforeDisable = await products.getRoomOrder();

    await products.updateRoomEnabled(b.id, false);
    await products.updateRoom(a.id, roomCommand("testing-room-policy-a-renamed", {
      location: "testing-location",
      capacity: 17,
      description: "A edited",
      enabled: true,
    }));
    const afterMetadata = await products.getRoomOrder();
    expect(afterMetadata.orderVersion).toBe(beforeDisable.orderVersion);
    expect(afterMetadata.items.find((room) => room.id === b.id)?.displayOrder).toBe(2);

    await products.deleteRoom(c.id);
    const e = await products.createRoom(roomCommand("testing-room-policy-e"));
    const beforeSave = await products.getRoomOrder();
    const saved = await products.saveRoomOrder({
      orderVersion: beforeSave.orderVersion,
      roomIds: [d.id, b.id, a.id, e.id],
    });
    expect(saved.items.map((room) => [room.id, room.displayOrder])).toEqual([
      [d.id, 1],
      [b.id, 2],
      [a.id, 3],
      [e.id, 4],
    ]);
    expect(saved.items.find((room) => room.id === a.id)).toMatchObject({
      name: "testing-room-policy-a-renamed",
      location: "testing-location",
      capacity: 17,
      description: "A edited",
      enabled: true,
    });
    expect(saved.items.find((room) => room.id === b.id)?.enabled).toBe(false);

    await products.updateRoomEnabled(b.id, true);
    const reactivated = await products.getRoomOrder();
    expect(reactivated.orderVersion).toBe(saved.orderVersion);
    expect(reactivated.items.map((room) => room.id)).toEqual([d.id, b.id, a.id, e.id]);
    expect((await products.listPublicRooms()).map((room) => room.id)).toEqual([d.id, b.id, a.id, e.id]);
  });

  it("rejects incomplete, duplicate, unknown and system room sets with full rollback", async () => {
    await resetProductData();
    const a = await products.createRoom(roomCommand("testing-room-validation-a"));
    const b = await products.createRoom(roomCommand("testing-room-validation-b"));
    const baseline = await products.getRoomOrder();
    const sentinel = await database.query("SELECT id FROM rooms WHERE system_reserved=true");
    const sentinelId = String(sentinel.rows[0]?.id);
    const unknownId = "33333333-3333-4333-8333-333333333333";

    for (const roomIds of [
      [a.id],
      [a.id, a.id],
      [a.id, unknownId],
      [a.id, sentinelId],
    ]) {
      await expect(products.saveRoomOrder({
        orderVersion: baseline.orderVersion,
        roomIds,
      })).rejects.toMatchObject({ kind: "CONFLICT", code: "ROOM_ORDER_CONFLICT" });
      expect(await products.getRoomOrder()).toEqual(baseline);
    }
    expect((await products.getRoomOrder()).items.map((room) => room.id)).toEqual([a.id, b.id]);
  });

  it("rejects stale saves after create or delete without partial order changes", async () => {
    await resetProductData();
    const a = await products.createRoom(roomCommand("testing-room-stale-a"));
    const b = await products.createRoom(roomCommand("testing-room-stale-b"));
    const beforeCreate = await products.getRoomOrder();
    const c = await products.createRoom(roomCommand("testing-room-stale-c"));
    await expect(products.saveRoomOrder({
      orderVersion: beforeCreate.orderVersion,
      roomIds: [b.id, a.id],
    })).rejects.toMatchObject({ kind: "CONFLICT", code: "ROOM_ORDER_CONFLICT" });
    expect((await products.getRoomOrder()).items.map((room) => room.id)).toEqual([a.id, b.id, c.id]);

    const beforeDelete = await products.getRoomOrder();
    await products.deleteRoom(c.id);
    await expect(products.saveRoomOrder({
      orderVersion: beforeDelete.orderVersion,
      roomIds: [b.id, a.id, c.id],
    })).rejects.toMatchObject({ kind: "CONFLICT", code: "ROOM_ORDER_CONFLICT" });
    expect((await products.getRoomOrder()).items.map((room) => room.id)).toEqual([a.id, b.id]);
  });

  it("serializes concurrent creates and accepts only one concurrent save version", async () => {
    await resetProductData();
    const created = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        products.createRoom(roomCommand(`testing-room-concurrent-${String(index).padStart(2, "0")}`))),
    );
    const displayOrders = created.map((room) => room.displayOrder);
    expect(displayOrders.every((order) => typeof order === "number")).toBe(true);
    expect(new Set(displayOrders).size).toBe(12);
    expect(displayOrders.map(Number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );

    const beforeSave = await products.getRoomOrder();
    const ids = beforeSave.items.map((room) => room.id);
    const saves = await Promise.allSettled([
      products.saveRoomOrder({ orderVersion: beforeSave.orderVersion, roomIds: [...ids].reverse() }),
      products.saveRoomOrder({ orderVersion: beforeSave.orderVersion, roomIds: [...ids.slice(1), ids[0]!] }),
    ]);
    expect(saves.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = saves.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ kind: "CONFLICT", code: "ROOM_ORDER_CONFLICT" });
    expect((await products.getRoomOrder()).orderVersion).toBe(beforeSave.orderVersion + 1);
  });

  it("keeps version and data unchanged when create, delete or save fails", async () => {
    await resetProductData();
    const a = await products.createRoom(roomCommand("testing-room-failure-a"));
    const b = await products.createRoom(roomCommand("testing-room-failure-b"));
    const baseline = await products.getRoomOrder();

    await expect(products.createRoom(roomCommand(a.name))).rejects.toMatchObject({
      kind: "CONFLICT",
      code: "ROOM_NAME_DUPLICATED",
    });
    await expect(products.deleteRoom("44444444-4444-4444-8444-444444444444")).rejects.toMatchObject({
      kind: "NOT_FOUND",
    });
    await expect(products.saveRoomOrder({
      orderVersion: baseline.orderVersion,
      roomIds: [b.id],
    })).rejects.toMatchObject({ kind: "CONFLICT", code: "ROOM_ORDER_CONFLICT" });
    expect(await products.getRoomOrder()).toEqual(baseline);
  });
});

describe("public password and atomic reservations", () => {
  let roomId: string;

  beforeAll(async () => {
    roomId = (await products.createRoom({
      name: "testing-room-password", location: "testing-building", capacity: 12,
      description: "testing-integration", enabled: true,
    })).id;
  });

  it("hashes ASCII 4 and 64 with bcrypt cost 12 and never stores plaintext", async () => {
    const four = await products.createPublicReservation(parsePublicReservation(
      publicPayload(roomId, "Aa1!", "testing-password-four", 10),
    ));
    const sixtyFourPassword = `A${"b".repeat(61)}1!`;
    const sixtyFour = await products.createPublicReservation(parsePublicReservation(
      publicPayload(roomId, sixtyFourPassword, "testing-password-sixty-four", 11),
    ));
    for (const [id, plaintext] of [[four.id, "Aa1!"], [sixtyFour.id, sixtyFourPassword]]) {
      const stored = await database.query("SELECT cancel_password_hash FROM reservations WHERE id=$1", [id]);
      const hash = String(stored.rows[0]?.cancel_password_hash);
      expect(hash).toMatch(/^\$2[aby]?\$12\$/);
      expect(hash).not.toContain(plaintext);
    }
    await expect(products.verifyPublicReservationForEdit(
      four.id,
      parsePublicPassword({ cancelPassword: "Aa1!" }),
    )).resolves.toMatchObject({ id: four.id });
    await expect(products.verifyPublicReservationForEdit(
      four.id,
      parsePublicPassword({ cancelPassword: "aa1!" }),
    )).rejects.toMatchObject({ code: "PUBLIC_RESERVATION_PASSWORD_MISMATCH" });
  });

  it.each([
    ["3 characters", "A1!"],
    ["65 characters", "A".repeat(65)],
    ["Korean", "비밀번호1!"],
    ["space", "pass word"],
    ["emoji", "pass😀"],
    ["full-width", "Ｐａｓｓ"],
  ])("rejects %s before hashing", async (_label, password) => {
    await expect(Promise.resolve().then(() => parsePublicReservation(
      publicPayload(roomId, password, `testing-invalid-${_label}`, 12),
    )).then((command) => products.createPublicReservation(command)))
      .rejects.toMatchObject({ kind: "VALIDATION", code: "VALIDATION_ERROR" });
  });

  it("allows exactly one winner for competing requests", async () => {
    const payload = publicPayload(roomId, "Race1!", "testing-race", 14);
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
      products.createPublicReservation(parsePublicReservation({
        ...payload,
        applicantEmail: `testing-race-${index}@example.test`,
        purpose: `testing-race-${index}`,
      }))));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(failures).toHaveLength(7);
    expect(failures.every((result) => result.reason instanceof AppError && result.reason.code === "TIME_SLOT_CONFLICT")).toBe(true);
  });
});

describe("public reservation mutation serialization", () => {
  it("keeps cancellation final when cancellation acquires the row lock first", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-public-cancel-first");
    const password = "Cancel1!";
    const original = publicPayload(roomId, password, "testing-public-cancel-first", 10);
    const created = await products.createPublicReservation(parsePublicReservation(original));
    const updated = {
      ...original,
      applicantName: "testing-public-should-not-update",
      purpose: "testing-public-should-not-update",
    };

    const results = await runQueuedPublicMutations(
      created.id,
      () => products.cancelPublicReservation(created.id, password),
      () => products.updatePublicReservation(created.id, parsePublicReservation(updated)),
    );

    expect(results[0]?.status).toBe("fulfilled");
    expect(results[1]).toMatchObject({
      status: "rejected",
      reason: { kind: "VALIDATION", code: "VALIDATION_ERROR" },
    });
    const final = (await database.query(
      `SELECT status,applicant_name,purpose,room_id,start_at,end_at
       FROM reservations WHERE id=$1`,
      [created.id],
    )).rows[0]!;
    expect(final).toMatchObject({
      status: "CANCELLED",
      applicant_name: original.applicantName,
      purpose: original.purpose,
      room_id: roomId,
    });
    expect(new Date(String(final.start_at)).toISOString()).toBe(new Date(original.startAt).toISOString());
    expect(new Date(String(final.end_at)).toISOString()).toBe(new Date(original.endAt).toISOString());
    const histories = await database.query(
      `SELECT action FROM reservation_histories
       WHERE reservation_id=$1 AND action IN ('UPDATED','CANCELLED')`,
      [created.id],
    );
    expect(histories.rows).toEqual([{ action: "CANCELLED" }]);
  });

  it("records update then cancellation snapshots when update acquires the row lock first", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-public-update-first");
    const password = "Update1!";
    const original = publicPayload(roomId, password, "testing-public-update-first", 11);
    const created = await products.createPublicReservation(parsePublicReservation(original));
    const updated = {
      ...original,
      applicantName: "testing-public-updated-first",
      purpose: "testing-public-updated-first",
    };

    const results = await runQueuedPublicMutations(
      created.id,
      () => products.updatePublicReservation(created.id, parsePublicReservation(updated)),
      () => products.cancelPublicReservation(created.id, password),
    );

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    expect((await database.query(
      "SELECT status,applicant_name,purpose FROM reservations WHERE id=$1",
      [created.id],
    )).rows[0]).toEqual({
      status: "CANCELLED",
      applicant_name: updated.applicantName,
      purpose: updated.purpose,
    });
    const histories = await database.query(
      `SELECT action,before_status,after_status,before_reservation_purpose,reservation_purpose,
        before_reservation_applicant_name,reservation_applicant_name
       FROM reservation_histories
       WHERE reservation_id=$1 AND action IN ('UPDATED','CANCELLED')
       ORDER BY created_at ASC,id ASC`,
      [created.id],
    );
    expect(histories.rows).toEqual([
      {
        action: "UPDATED",
        before_status: "REQUESTED",
        after_status: "REQUESTED",
        before_reservation_purpose: original.purpose,
        reservation_purpose: updated.purpose,
        before_reservation_applicant_name: original.applicantName,
        reservation_applicant_name: updated.applicantName,
      },
      {
        action: "CANCELLED",
        before_status: "REQUESTED",
        after_status: "CANCELLED",
        before_reservation_purpose: updated.purpose,
        reservation_purpose: updated.purpose,
        before_reservation_applicant_name: updated.applicantName,
        reservation_applicant_name: updated.applicantName,
      },
    ]);
  });

  it("allows only one concurrent cancellation and records one cancellation history", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-public-double-cancel");
    const password = "Double1!";
    const payload = publicPayload(roomId, password, "testing-public-double-cancel", 12);
    const created = await products.createPublicReservation(parsePublicReservation(payload));

    const results = await runQueuedPublicMutations(
      created.id,
      () => products.cancelPublicReservation(created.id, password),
      () => products.cancelPublicReservation(created.id, password),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ kind: "VALIDATION", code: "VALIDATION_ERROR" }),
      }),
    ]);
    expect((await database.query(
      "SELECT status FROM reservations WHERE id=$1",
      [created.id],
    )).rows).toEqual([{ status: "CANCELLED" }]);
    expect((await database.query(
      `SELECT action FROM reservation_histories
       WHERE reservation_id=$1 AND action='CANCELLED'`,
      [created.id],
    )).rows).toEqual([{ action: "CANCELLED" }]);
  });

  it("preserves public mutation password, not-found, cancelled, and read-only verification contracts", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-public-mutation-contracts");
    const password = "Contract1!";
    const payload = publicPayload(roomId, password, "testing-public-mutation-contracts", 13);
    const created = await products.createPublicReservation(parsePublicReservation(payload));

    const blocker = await database.pool.connect();
    await blocker.query("BEGIN");
    try {
      await blocker.query("SELECT id FROM reservations WHERE id=$1 FOR UPDATE", [created.id]);
      await expect(Promise.race([
        products.verifyPublicReservationForEdit(created.id, password),
        new Promise((_, reject) => setTimeout(() => reject(new Error("read-only verification waited for a row lock")), 2_000)),
      ])).resolves.toMatchObject({ id: created.id, editable: true });
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }

    await expect(products.updatePublicReservation(
      created.id,
      parsePublicReservation({ ...payload, cancelPassword: "Wrong1!" }),
    )).rejects.toMatchObject({ kind: "CREDENTIAL_MISMATCH", code: "PUBLIC_RESERVATION_PASSWORD_MISMATCH" });
    await expect(products.cancelPublicReservation(created.id, "Wrong1!"))
      .rejects.toMatchObject({ kind: "CREDENTIAL_MISMATCH", code: "PUBLIC_CANCEL_PASSWORD_MISMATCH" });
    const missingId = "00000000-0000-4000-8000-000000000099";
    await expect(products.updatePublicReservation(
      missingId,
      parsePublicReservation(payload),
    )).rejects.toMatchObject({ kind: "NOT_FOUND", code: "NOT_FOUND" });
    await expect(products.cancelPublicReservation(missingId, password))
      .rejects.toMatchObject({ kind: "NOT_FOUND", code: "NOT_FOUND" });

    await expect(products.cancelPublicReservation(created.id, password)).resolves.toMatchObject({ status: "CANCELLED" });
    await expect(products.updatePublicReservation(created.id, parsePublicReservation(payload)))
      .rejects.toMatchObject({ kind: "VALIDATION", code: "VALIDATION_ERROR" });
    await expect(products.cancelPublicReservation(created.id, password))
      .rejects.toMatchObject({ kind: "VALIDATION", code: "VALIDATION_ERROR" });
    expect((await database.query(
      `SELECT action FROM reservation_histories
       WHERE reservation_id=$1 AND action IN ('UPDATED','CANCELLED')`,
      [created.id],
    )).rows).toEqual([{ action: "CANCELLED" }]);
  });
});

describe("public reservation privacy contracts", () => {
  it("masks every public timetable applicant name while preserving admin names", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-public-name-privacy");
    const names = [
      { value: "\uAE40", masked: "*" },
      { value: "\uC774\uC218", masked: "\uC774*" },
      { value: "\uD64D\uAE38\uB3D9", masked: "\uD64D*\uB3D9" },
      { value: "Alice", masked: "A*e" },
      { value: "\u{20BB7}\u91CE\u5BB6", masked: "\u{20BB7}*\u5BB6" },
    ];
    for (const [index, name] of names.entries()) {
      await insertReservation({
        roomId,
        applicantName: name.value,
        purpose: `testing-public-name-privacy-${index}`,
        hour: 10 + index,
      });
    }
    const { app, cookie } = await authenticatedApp();
    const weekStart = futureWeekday(55, 10).slice(0, 10);

    const publicResponse = await app.request(
      `http://worker.test/api/public/rooms/${roomId}/weekly-reservations?weekStart=${weekStart}`,
    );
    expect(publicResponse.status).toBe(200);
    const publicBody = await publicResponse.json() as {
      reservations: Array<{ purpose: string; applicantName: string }>;
    };
    const publicJson = JSON.stringify(publicBody);
    for (const [index, name] of names.entries()) {
      expect(publicJson).not.toContain(name.value);
      expect(publicBody.reservations.find(
        (reservation) => reservation.purpose === `testing-public-name-privacy-${index}`,
      )?.applicantName).toBe(name.masked);
    }

    const adminResponse = await app.request(
      `http://worker.test/api/admin/reservations?roomId=${roomId}&size=100`,
      { headers: { cookie } },
    );
    expect(adminResponse.status).toBe(200);
    const adminBody = await adminResponse.json() as { items: Array<{ applicantName: string }> };
    expect(adminBody.items.map((item) => item.applicantName)).toEqual(
      expect.arrayContaining(names.map((name) => name.value)),
    );
  });

  it("exposes an original public applicant name only after password verification", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-public-detail-privacy");
    const { app, writeHeaders } = await authenticatedApp();
    const applicantName = "Sensitive Applicant";
    const password = "Privacy1!";
    const payload = {
      ...publicPayload(roomId, password, "testing-public-detail-privacy", 10),
      applicantName,
      applicantEmail: "a@example.test",
    };

    const createResponse = await app.request("http://worker.test/api/public/reservations", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify(payload),
    });
    expect(createResponse.status).toBe(201);
    const createdJson = await createResponse.text();
    expect(createdJson).not.toContain(applicantName);
    const reservationId = (JSON.parse(createdJson) as { id: string }).id;

    const detailResponse = await app.request(
      `http://worker.test/api/public/reservations/${reservationId}`,
    );
    expect(detailResponse.status).toBe(200);
    const detailJson = await detailResponse.text();
    expect(detailJson).not.toContain(applicantName);
    expect(detailJson).not.toContain(payload.applicantEmail);
    expect(detailJson).toContain("S*t");
    expect(detailJson).toContain("*@example.test");

    const rejectedVerification = await app.request(
      `http://worker.test/api/public/reservations/${reservationId}/edit`,
      {
        method: "POST",
        headers: writeHeaders,
        body: JSON.stringify({ cancelPassword: "Wrong1!" }),
      },
    );
    expect(rejectedVerification.status).toBe(403);
    expect(await rejectedVerification.text()).not.toContain(applicantName);

    const verifiedResponse = await app.request(
      `http://worker.test/api/public/reservations/${reservationId}/edit`,
      {
        method: "POST",
        headers: writeHeaders,
        body: JSON.stringify({ cancelPassword: password }),
      },
    );
    expect(verifiedResponse.status).toBe(200);
    expect(await verifiedResponse.json()).toMatchObject({
      applicantName,
      applicantEmail: payload.applicantEmail,
    });
  });

  it("shows an admin applicant name publicly only when enabled and always masks contacts", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-applicant-visibility");
    const { app, cookie, writeHeaders } = await authenticatedApp();
    const startAt = futureWeekday(55, 15);
    const applicantName = "Visible Applicant";
    const payload = {
      roomId,
      applicantName,
      applicantEmail: "visible-applicant@example.test",
      applicantPhone: "010-9876-5432",
      purpose: "testing-admin-visible-applicant",
      startAt,
      endAt: addHour(startAt),
      status: "CONFIRMED",
      showApplicantName: true,
    };
    const createdResponse = await app.request("http://worker.test/api/admin/reservations", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify(payload),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { id: string; showApplicantName: boolean };
    expect(created.showApplicantName).toBe(true);

    const weeklyResponse = await app.request(
      `http://worker.test/api/public/rooms/${roomId}/weekly-reservations?weekStart=${weekStartFor(startAt)}`,
    );
    expect(weeklyResponse.status).toBe(200);
    const weeklyJson = await weeklyResponse.text();
    expect(weeklyJson).toContain(applicantName);
    expect(weeklyJson).not.toContain(payload.applicantEmail);
    expect(weeklyJson).not.toContain(payload.applicantPhone);

    const publicDetailResponse = await app.request(
      `http://worker.test/api/public/reservations/${created.id}`,
    );
    expect(publicDetailResponse.status).toBe(200);
    const publicDetail = await publicDetailResponse.json() as {
      applicantName: string;
      applicantEmail: string;
      applicantPhone: string;
    };
    expect(publicDetail).toMatchObject({
      applicantName,
      applicantEmail: "vi***************@example.test",
      applicantPhone: "0109******2",
    });

    const adminList = await app.request(
      `http://worker.test/api/admin/reservations?roomId=${roomId}`,
      { headers: { cookie } },
    );
    expect(await adminList.json()).toMatchObject({
      items: [expect.objectContaining({ applicantName, showApplicantName: true })],
    });

    const hiddenResponse = await app.request(
      `http://worker.test/api/admin/reservations/${created.id}`,
      {
        method: "PUT",
        headers: writeHeaders,
        body: JSON.stringify({ ...payload, showApplicantName: false }),
      },
    );
    expect(hiddenResponse.status).toBe(200);
    expect(await hiddenResponse.json()).toMatchObject({ applicantName, showApplicantName: false });

    const hiddenDetail = await app.request(
      `http://worker.test/api/public/reservations/${created.id}`,
    );
    expect(await hiddenDetail.json()).toMatchObject({ applicantName: "V*t" });

    const histories = await app.request(
      `http://worker.test/api/admin/reservations/${created.id}/histories`,
      { headers: { cookie } },
    );
    expect(await histories.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "UPDATED",
        beforeReservationShowApplicantName: true,
        reservationShowApplicantName: false,
      }),
    ]));
  });

  it("keeps public form reservations hidden even when clients or admins request visibility", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-public-visibility-guard");
    const { app, writeHeaders } = await authenticatedApp();
    const applicantName = "Never Public";
    const payload = {
      ...publicPayload(roomId, "Guard1!", "testing-public-visibility-guard", 10),
      applicantName,
      showApplicantName: true,
    };
    const createdResponse = await app.request("http://worker.test/api/public/reservations", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify(payload),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { id: string };
    expect((await database.query(
      "SELECT show_applicant_name FROM reservations WHERE id=$1",
      [created.id],
    )).rows).toEqual([{ show_applicant_name: false }]);

    const publicUpdate = await app.request(
      `http://worker.test/api/public/reservations/${created.id}`,
      {
        method: "PUT",
        headers: writeHeaders,
        body: JSON.stringify(payload),
      },
    );
    expect(publicUpdate.status).toBe(200);
    expect((await database.query(
      "SELECT show_applicant_name FROM reservations WHERE id=$1",
      [created.id],
    )).rows).toEqual([{ show_applicant_name: false }]);

    const adminUpdate = await app.request(
      `http://worker.test/api/admin/reservations/${created.id}`,
      {
        method: "PUT",
        headers: writeHeaders,
        body: JSON.stringify({ ...payload, status: "REQUESTED", showApplicantName: true }),
      },
    );
    expect(adminUpdate.status).toBe(200);
    expect(await adminUpdate.json()).toMatchObject({ showApplicantName: false });
    const safeDetail = await app.request(`http://worker.test/api/public/reservations/${created.id}`);
    const safeJson = await safeDetail.text();
    expect(safeJson).not.toContain(applicantName);
    expect(safeJson).toContain("N*c");
  });

  it("inherits recurrence visibility and allows an independent generated reservation override", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-recurring-visibility");
    const firstDate = futureWeekday(70, 10).slice(0, 10);
    const secondDate = new Date(`${firstDate}T00:00:00Z`);
    do {
      secondDate.setUTCDate(secondDate.getUTCDate() + 1);
    } while (secondDate.getUTCDay() === 0 || secondDate.getUTCDay() === 6);
    const recurrencePayload = {
      roomId,
      applicantName: "Recurring Visible",
      applicantEmail: null,
      applicantPhone: null,
      purpose: "testing-recurring-visible-applicant",
      tagId: null,
      startDate: firstDate,
      endDate: secondDate.toISOString().slice(0, 10),
      daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
      startTime: "10:00",
      endTime: "11:00",
      conflictPolicy: "FAIL_ALL",
      showApplicantName: true,
    };
    const result = await products.createRecurrence(parseRecurrenceCreate(recurrencePayload), "admin");
    expect(result.createdCount).toBe(2);
    const rows = await database.query(
      `SELECT id, start_at, show_applicant_name
       FROM reservations WHERE recurrence_id=$1 ORDER BY start_at`,
      [result.recurrenceId],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every((row) => row.show_applicant_name === true)).toBe(true);
    expect((await database.query(
      "SELECT show_applicant_name FROM reservation_recurrences WHERE id=$1",
      [result.recurrenceId],
    )).rows).toEqual([{ show_applicant_name: true }]);

    const edited = rows.rows[0]!;
    await products.updateAdminReservation(String(edited.id), parseAdminReservation({
      roomId,
      applicantName: recurrencePayload.applicantName,
      applicantEmail: null,
      applicantPhone: null,
      purpose: recurrencePayload.purpose,
      startAt: new Date(String(edited.start_at)).toISOString(),
      endAt: new Date(new Date(String(edited.start_at)).getTime() + 60 * 60_000).toISOString(),
      status: "CONFIRMED",
      showApplicantName: false,
    }), "admin");
    const after = await database.query(
      `SELECT show_applicant_name FROM reservations WHERE recurrence_id=$1 ORDER BY start_at`,
      [result.recurrenceId],
    );
    expect(after.rows.map((row) => row.show_applicant_name)).toEqual([false, true]);
    expect((await database.query(
      "SELECT show_applicant_name FROM reservation_recurrences WHERE id=$1",
      [result.recurrenceId],
    )).rows).toEqual([{ show_applicant_name: true }]);
  });
});

describe("HTTP session, CSRF, admin contracts and cleanup", () => {
  it("supports the existing cookie/header flow and guarded product routes", async () => {
    const app = createHttpApp(parseRuntimeConfig({ APP_ENV: "uat", E2E_CLEANUP_ENABLED: "true" }), {
      products,
      sessions,
      rateLimiter: allowAllRateLimiter,
      resolveClientIp: fixedClientIpResolver,
      adminUsername: "admin",
      adminPassword: "admin1234",
    });
    const csrfResponse = await app.request("http://worker.test/api/auth/csrf");
    expect(csrfResponse.status).toBe(200);
    const csrf = await csrfResponse.json() as { token: string };
    const setCookie = csrfResponse.headers.get("set-cookie") || "";
    const sessionId = /ROOM-SESSION=([^;,]+)/.exec(setCookie)?.[1];
    const csrfCookie = /XSRF-TOKEN=([^;,]+)/.exec(setCookie)?.[1];
    expect(sessionId).toBeTruthy();
    expect(csrfCookie).toBe(csrf.token);
    const cookie = `ROOM-SESSION=${sessionId}; XSRF-TOKEN=${csrfCookie}`;
    const writeHeaders = { "content-type": "application/json", "cookie": cookie, "X-XSRF-TOKEN": csrf.token };

    expect((await app.request("http://worker.test/api/auth/admin/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin1234" }),
    })).status).toBe(403);
    const loginResponse = await app.request("http://worker.test/api/auth/admin/login", {
      method: "POST", headers: writeHeaders, body: JSON.stringify({ username: "admin", password: "admin1234" }),
    });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers.get("set-cookie")).toContain("ROOM-SESSION=");
    expect((await app.request("http://worker.test/api/auth/admin/me", { headers: { cookie } })).status).toBe(200);

    const roomResponse = await app.request("http://worker.test/api/admin/rooms", {
      method: "POST", headers: writeHeaders,
      body: JSON.stringify({ name: "testing-room-http", location: "testing-http", capacity: 8, description: "testing-http", enabled: true }),
    });
    expect(roomResponse.status).toBe(201);
    const room = await roomResponse.json() as { id: string };

    const invalidPublic = await app.request("http://worker.test/api/public/reservations", {
      method: "POST", headers: writeHeaders,
      body: JSON.stringify(publicPayload(room.id, "한글Pass1!", "testing-http-invalid", 15)),
    });
    expect(invalidPublic.status).toBe(400);

    const preview = await app.request("http://worker.test/api/admin/test-data/e2e/preview", { headers: { cookie } });
    expect(preview.status).toBe(200);
    const cleanup = await app.request("http://worker.test/api/admin/test-data/e2e", { method: "DELETE", headers: writeHeaders });
    expect(cleanup.status).toBe(200);
  });
});

async function resetProductData() {
  await database.query("DELETE FROM admin_sessions");
  await database.query("DELETE FROM reservation_histories");
  await database.query("DELETE FROM reservations");
  await database.query("DELETE FROM reservation_recurrences");
  await database.query("DELETE FROM tags");
  await database.query("DELETE FROM rooms WHERE system_reserved=false");
  await database.query("UPDATE room_order_state SET version=0 WHERE id=1");
  await database.query(
    `UPDATE operation_settings SET organization_name='Room Reservation', public_notice=NULL,
      reservation_enabled=true, reservation_disabled_message=NULL,
      semester_start_date=(current_date - interval '1 day')::date,
      semester_end_date=(current_date + interval '180 days')::date,
      open_time='09:00', close_time='18:00', available_days_of_week='MON,TUE,WED,THU,FRI',
      public_open_time='09:00', public_close_time='18:00',
      public_available_days_of_week='MON,TUE,WED,THU,FRI',
      min_reservation_minutes=30, max_reservation_minutes=240,
      admin_contact_email='admin@example.test', admin_contact_phone=NULL,
      completion_message=NULL, updated_by=NULL, version=0`,
  );
}

async function insertRoom(name: string) {
  return (await products.createRoom({
    name,
    location: null,
    capacity: 10,
    description: null,
    enabled: true,
  })).id;
}

async function insertTag(name: string) {
  const result = await database.query(
    "INSERT INTO tags(name,color) VALUES($1,'#123456') RETURNING id",
    [name],
  );
  return String(result.rows[0]?.id);
}

async function insertRecurrence(input: {
  roomId: string;
  purpose: string;
  applicantName?: string;
  applicantEmail?: string;
  tagId?: string | null;
  createdAt?: string;
}) {
  const date = futureWeekday(35, 10).slice(0, 10);
  const result = await database.query(
    `INSERT INTO reservation_recurrences(
       room_id,applicant_name,applicant_email,applicant_phone,purpose,start_date,end_date,
       days_of_week,start_time,end_time,conflict_policy,tag_id,created_by,created_at
     ) VALUES($1,$2,$3,'01000000000',$4,$5,$5,'MON','10:00','11:00','FAIL_ALL',$6,'admin',$7)
     RETURNING id`,
    [input.roomId, input.applicantName ?? "ordinary applicant", input.applicantEmail ?? "ordinary@example.test",
      input.purpose, date, input.tagId ?? null, input.createdAt ?? new Date().toISOString()],
  );
  return String(result.rows[0]?.id);
}

async function insertReservation(input: {
  roomId: string;
  purpose: string;
  applicantName?: string;
  applicantEmail?: string;
  applicantPhone?: string | null;
  recurrenceId?: string | null;
  hour?: number;
  status?: string;
  source?: string;
  createdAt?: string;
  recurrenceException?: boolean;
}) {
  const startAt = futureWeekday(55, input.hour ?? 10);
  const result = await database.query(
    `INSERT INTO reservations(
       room_id,recurrence_id,applicant_name,applicant_email,applicant_phone,purpose,
       start_at,end_at,status,source,created_by_actor_type,created_at,recurrence_exception
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ADMIN',$11,$12) RETURNING id`,
    [input.roomId, input.recurrenceId ?? null, input.applicantName ?? "ordinary applicant",
      input.applicantEmail ?? "ordinary@example.test",
      input.applicantPhone === undefined ? "01000000000" : input.applicantPhone,
      input.purpose, startAt, addHour(startAt),
      input.status ?? "CONFIRMED", input.source ?? "ADMIN_MANUAL", input.createdAt ?? new Date().toISOString(),
      input.recurrenceException ?? false],
  );
  return String(result.rows[0]?.id);
}

async function insertReservationHistory(reservationId: string, memo: string) {
  await database.query(
    "INSERT INTO reservation_histories(reservation_id,action,actor_type,memo) VALUES($1,'UPDATED','ADMIN',$2)",
    [reservationId, memo],
  );
}

async function authenticatedApp(environment: "uat" | "prod" = "uat") {
  const app = createHttpApp(parseRuntimeConfig({ APP_ENV: environment, E2E_CLEANUP_ENABLED: "false" }), {
    products,
    sessions,
    rateLimiter: allowAllRateLimiter,
    resolveClientIp: fixedClientIpResolver,
    adminUsername: "admin",
    adminPassword: "admin1234",
  });
  const csrfResponse = await app.request("http://worker.test/api/auth/csrf");
  const csrf = await csrfResponse.json() as { token: string };
  const setCookie = csrfResponse.headers.get("set-cookie") || "";
  const sessionId = /ROOM-SESSION=([^;,]+)/.exec(setCookie)?.[1];
  const csrfCookie = /XSRF-TOKEN=([^;,]+)/.exec(setCookie)?.[1];
  if (!sessionId || !csrfCookie) throw new Error("Session cookies were not issued");
  const cookie = `ROOM-SESSION=${sessionId}; XSRF-TOKEN=${csrfCookie}`;
  const writeHeaders = { "content-type": "application/json", cookie, "X-XSRF-TOKEN": csrf.token };
  const login = await app.request("http://worker.test/api/auth/admin/login", {
    method: "POST", headers: writeHeaders, body: JSON.stringify({ username: "admin", password: "admin1234" }),
  });
  expect(login.status).toBe(200);
  return { app, cookie, csrf: csrf.token, writeHeaders, csrfResponse, login };
}

describe("applicant phone normalization HTTP contract", () => {
  it("normalizes public, admin, recurrence, history, detail and CSV phone values", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-phone-normalization");
    const { app, cookie, writeHeaders } = await authenticatedApp();
    const publicPassword = "Phone1!";
    const publicInput = {
      ...publicPayload(roomId, publicPassword, "testing-phone-public", 10),
      applicantPhone: "010-1234 5678",
    };
    const publicCreate = await app.request("http://worker.test/api/public/reservations", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify(publicInput),
    });
    expect(publicCreate.status).toBe(201);
    const publicReservation = await publicCreate.json() as { id: string };
    expect((await database.query(
      "SELECT applicant_phone FROM reservations WHERE id=$1",
      [publicReservation.id],
    )).rows).toEqual([{ applicant_phone: "01012345678" }]);
    expect((await products.verifyPublicReservationForEdit(publicReservation.id, publicPassword)).applicantPhone)
      .toBe("01012345678");

    const publicUpdate = await app.request(
      `http://worker.test/api/public/reservations/${publicReservation.id}`,
      {
        method: "PUT",
        headers: writeHeaders,
        body: JSON.stringify({
          ...publicInput,
          applicantPhone: "010 9999-8888",
          purpose: "testing-phone-public-updated",
        }),
      },
    );
    expect(publicUpdate.status).toBe(200);
    expect((await products.verifyPublicReservationForEdit(publicReservation.id, publicPassword)).applicantPhone)
      .toBe("01099998888");
    expect(await (await app.request(
      `http://worker.test/api/public/reservations/${publicReservation.id}`,
    )).json()).toMatchObject({ applicantPhone: "0109******8" });

    const invalidPublic = await app.request("http://worker.test/api/public/reservations", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({ ...publicInput, applicantPhone: "010.1234.5678" }),
    });
    expect(invalidPublic.status).toBe(400);
    expect(await invalidPublic.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: [expect.objectContaining({ field: "applicantPhone" })],
    });

    const adminInput = {
      roomId,
      applicantName: "testing-phone-admin",
      applicantEmail: null,
      applicantPhone: "010 2222-3333",
      purpose: "testing-phone-admin",
      startAt: futureWeekday(21, 12),
      endAt: futureWeekday(21, 13),
      status: "CONFIRMED",
      showApplicantName: false,
    };
    const adminCreate = await app.request("http://worker.test/api/admin/reservations", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify(adminInput),
    });
    expect(adminCreate.status).toBe(201);
    const adminReservation = await adminCreate.json() as { id: string; applicantPhone: string };
    expect(adminReservation.applicantPhone).toBe("01022223333");
    const adminUpdate = await app.request(
      `http://worker.test/api/admin/reservations/${adminReservation.id}`,
      {
        method: "PUT",
        headers: writeHeaders,
        body: JSON.stringify({ ...adminInput, applicantPhone: "010-4444 5555" }),
      },
    );
    expect(adminUpdate.status).toBe(200);
    expect(await adminUpdate.json()).toMatchObject({ applicantPhone: "01044445555" });

    const emptyAdminCreate = await app.request("http://worker.test/api/admin/reservations", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({
        ...adminInput,
        applicantName: "testing-phone-admin-empty",
        applicantPhone: "",
        purpose: "testing-phone-admin-empty",
        startAt: futureWeekday(21, 14),
        endAt: futureWeekday(21, 15),
      }),
    });
    expect(emptyAdminCreate.status).toBe(201);
    expect(await emptyAdminCreate.json()).toMatchObject({ applicantPhone: null });

    const recurrenceDate = futureWeekday(42, 16).slice(0, 10);
    const recurrenceCreate = await app.request("http://worker.test/api/admin/recurrences", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({
        roomId,
        applicantName: "testing-phone-recurrence",
        applicantEmail: null,
        applicantPhone: "010-6666 7777",
        purpose: "testing-phone-recurrence",
        tagId: null,
        startDate: recurrenceDate,
        endDate: recurrenceDate,
        daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
        startTime: "16:00",
        endTime: "17:00",
        conflictPolicy: "FAIL_ALL",
        showApplicantName: false,
      }),
    });
    expect(recurrenceCreate.status).toBe(201);
    const recurrence = await recurrenceCreate.json() as { recurrenceId: string };
    const recurrencePhones = await database.query(
      `SELECT
         (SELECT applicant_phone FROM reservation_recurrences WHERE id=$1) AS recurrence_phone,
         (SELECT applicant_phone FROM reservations WHERE recurrence_id=$1) AS reservation_phone,
         (SELECT reservation_applicant_phone FROM reservation_histories
          WHERE reservation_id=(SELECT id FROM reservations WHERE recurrence_id=$1)) AS history_phone`,
      [recurrence.recurrenceId],
    );
    expect(recurrencePhones.rows[0]).toEqual({
      recurrence_phone: "01066667777",
      reservation_phone: "01066667777",
      history_phone: "01066667777",
    });
    expect(await (await app.request(
      `http://worker.test/api/admin/recurrences/${recurrence.recurrenceId}`,
      { headers: { cookie } },
    )).json()).toMatchObject({ applicantPhone: "01066667777" });

    const csv = await (await app.request(
      "http://worker.test/api/admin/exports/reservations.csv?keyword=testing-phone-admin",
      { headers: { cookie } },
    )).text();
    expect(csv).toContain("01044445555");
    expect(csv).not.toContain("010-4444 5555");

    const historyId = String((await database.query(
      "SELECT id FROM reservation_histories WHERE reservation_id=$1 ORDER BY created_at DESC LIMIT 1",
      [adminReservation.id],
    )).rows[0]?.id);
    await expect(database.query(
      "UPDATE reservations SET applicant_phone='010-1234' WHERE id=$1",
      [adminReservation.id],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(database.query(
      "UPDATE reservation_recurrences SET applicant_phone='phone' WHERE id=$1",
      [recurrence.recurrenceId],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(database.query(
      "UPDATE reservation_histories SET reservation_applicant_phone='010 1234' WHERE id=$1",
      [historyId],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(database.query(
      "UPDATE reservation_histories SET before_reservation_applicant_phone='-' WHERE id=$1",
      [historyId],
    )).rejects.toMatchObject({ code: "23514" });
  });
});

describe("reservation search contract", () => {
  it("searches admin reservations by applicant text, phone and processing memo without changing shared CSV filters", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-search-primary");
    const otherRoomId = await insertRoom("testing-room-search-other");
    const nameId = await insertReservation({
      roomId, purpose: "testing-search-name-purpose", applicantName: "testing-search-name-needle", hour: 10,
    });
    const emailId = await insertReservation({
      roomId, purpose: "testing-search-email-purpose", applicantEmail: "testing-search-email-needle@example.test", hour: 11,
    });
    const purposeId = await insertReservation({
      roomId, purpose: "testing-search-purpose-needle", applicantName: "ordinary applicant", hour: 12,
    });
    const phoneId = await insertReservation({
      roomId, purpose: "testing-search-phone-target", applicantPhone: "01012345678", hour: 13,
    });
    const memoId = await insertReservation({
      roomId, purpose: "testing-search-memo-target", applicantName: "memo applicant", hour: 14,
    });
    const deletedId = await insertReservation({
      roomId, purpose: "testing-search-deleted-memo-target", applicantName: "deleted applicant", hour: 15,
    });
    await insertReservationHistory(memoId, "testing-processing-memo-needle");
    await insertReservationHistory(memoId, "testing-processing-memo-needle second hit");
    await insertReservationHistory(deletedId, "testing-processing-memo-needle deleted hit");
    await products.deleteReservation(deletedId, "testing-delete-search-candidate", "admin");

    const listIds = async (searchParams: URLSearchParams) => {
      const result = await products.listReservations({
        page: 0,
        size: 20,
        offset: 0,
        ...parseReservationFilter(searchParams),
      });
      return { ids: result.items.map((item) => item.id), totalItems: result.totalItems };
    };
    const keywordIds = (keyword: string) => listIds(new URLSearchParams({ keyword }));
    const csvFor = (searchParams: URLSearchParams) => products.exportReservationsCsv(parseReservationFilter(searchParams));

    for (const [keyword, expectedId] of [
      ["testing-search-name-needle", nameId],
      ["testing-search-email-needle", emailId],
      ["testing-search-purpose-needle", purposeId],
    ] as const) {
      expect((await keywordIds(keyword)).ids).toEqual([expectedId]);
    }

    for (const keyword of ["0101234", "010-1234", "010 1234"]) {
      expect((await keywordIds(keyword)).ids).toEqual([phoneId]);
    }

    const memoSearch = await keywordIds("testing-processing-memo-needle");
    expect(memoSearch).toEqual({ ids: [memoId], totalItems: 1 });
    expect((await keywordIds("testing-search-no-match")).ids).toEqual([]);

    const phoneCsv = await csvFor(new URLSearchParams({ keyword: "010-1234" }));
    expect(phoneCsv).toContain(phoneId);
    expect(phoneCsv).toContain("testing-search-phone-target");
    expect(phoneCsv).not.toContain(nameId);

    const memoCsv = await csvFor(new URLSearchParams({ keyword: "testing-processing-memo-needle" }));
    expect(memoCsv).toContain(memoId);
    expect(memoCsv).toContain("testing-search-memo-target");
    expect(memoCsv).not.toContain(deletedId);

    await insertReservation({
      roomId: otherRoomId, purpose: "testing-search-phone-other-room", applicantPhone: "01012345678", hour: 16,
    });
    await insertReservation({
      roomId, purpose: "testing-search-phone-requested", applicantPhone: "01012345678", status: "REQUESTED", hour: 17,
    });
    await insertReservation({
      roomId, purpose: "testing-search-phone-public-source", applicantPhone: "01012345678", source: "PUBLIC_FORM", hour: 18,
    });
    expect((await listIds(new URLSearchParams({
      keyword: "010 1234",
      roomId,
      status: "CONFIRMED",
      source: "ADMIN_MANUAL",
    }))).ids).toEqual([phoneId]);
  });
});

describe("room name normalization HTTP contract", () => {
  it("normalizes create and update names, preserves duplicate handling, and records normalized snapshots", async () => {
    await resetProductData();
    const { app, writeHeaders } = await authenticatedApp();

    const createResponse = await app.request("http://worker.test/api/admin/rooms", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({
        name: " \t testing-room-trim \r\n",
        location: "Building A",
        capacity: 10,
        description: "Room description",
        enabled: true,
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { id: string; name: string };
    expect(created.name).toBe("testing-room-trim");

    const duplicateResponse = await app.request("http://worker.test/api/admin/rooms", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({
        name: " testing-room-trim ",
        location: "Building B",
        capacity: 5,
        description: null,
        enabled: true,
      }),
    });
    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      code: "ROOM_NAME_DUPLICATED",
    });

    const updateResponse = await app.request(`http://worker.test/api/admin/rooms/${created.id}`, {
      method: "PUT",
      headers: writeHeaders,
      body: JSON.stringify({
        name: "\n testing-room-trim-updated\t ",
        location: "Building A",
        capacity: 10,
        description: "Room description",
        enabled: true,
      }),
    });
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      id: created.id,
      name: "testing-room-trim-updated",
    });

    const storedRoom = await database.query<{ name: string }>(
      "SELECT name FROM rooms WHERE id=$1",
      [created.id],
    );
    expect(storedRoom.rows[0]?.name).toBe("testing-room-trim-updated");

    const startAt = futureWeekday(30, 10);
    const reservation = await products.createAdminReservation(
      parseAdminReservation({
        roomId: created.id,
        applicantName: "testing-room-trim-applicant",
        applicantEmail: "testing-room-trim@example.test",
        applicantPhone: null,
        purpose: "testing-room-trim-audit",
        startAt,
        endAt: addHour(startAt),
        status: "CONFIRMED",
        showApplicantName: false,
      }),
      "admin",
    );
    const history = await database.query<{ reservation_room_name: string }>(
      `SELECT reservation_room_name
       FROM reservation_histories
       WHERE reservation_id=$1 AND action='CREATED_BY_ADMIN'`,
      [reservation.id],
    );
    expect(history.rows).toEqual([
      { reservation_room_name: "testing-room-trim-updated" },
    ]);
  });
});

describe("room display order HTTP contract", () => {
  it("returns the complete ordinary-room order and rejects invalid or stale saves", async () => {
    await resetProductData();
    const first = await products.createRoom({
      name: "testing-room-http-order-a",
      location: null,
      capacity: 10,
      description: null,
      enabled: true,
    });
    const second = await products.createRoom({
      name: "testing-room-http-order-b",
      location: null,
      capacity: 10,
      description: null,
      enabled: false,
    });
    const { app, cookie, writeHeaders } = await authenticatedApp();

    const orderResponse = await app.request("http://worker.test/api/admin/rooms/order", {
      headers: { cookie },
    });
    expect(orderResponse.status).toBe(200);
    const order = await orderResponse.json() as {
      orderVersion: number;
      items: Array<{ id: string; enabled: boolean; displayOrder: number }>;
    };
    expect(order.items).toEqual([
      expect.objectContaining({ id: first.id, enabled: true, displayOrder: 1 }),
      expect.objectContaining({ id: second.id, enabled: false, displayOrder: 2 }),
    ]);

    const saveResponse = await app.request("http://worker.test/api/admin/rooms/order", {
      method: "PUT",
      headers: writeHeaders,
      body: JSON.stringify({
        orderVersion: order.orderVersion,
        roomIds: [second.id, first.id],
      }),
    });
    expect(saveResponse.status).toBe(200);
    const saved = await saveResponse.json() as {
      orderVersion: number;
      items: Array<{ id: string; displayOrder: number }>;
    };
    expect(saved.orderVersion).toBe(order.orderVersion + 1);
    expect(saved.items.map((room) => [room.id, room.displayOrder])).toEqual([
      [second.id, 1],
      [first.id, 2],
    ]);

    const staleResponse = await app.request("http://worker.test/api/admin/rooms/order", {
      method: "PUT",
      headers: writeHeaders,
      body: JSON.stringify({
        orderVersion: order.orderVersion,
        roomIds: [first.id, second.id],
      }),
    });
    expect(staleResponse.status).toBe(409);
    expect((await staleResponse.json() as { code: string }).code).toBe("ROOM_ORDER_CONFLICT");

    for (const roomIds of [
      [first.id, first.id],
      ["not-a-uuid", second.id],
    ]) {
      const invalidResponse = await app.request("http://worker.test/api/admin/rooms/order", {
        method: "PUT",
        headers: writeHeaders,
        body: JSON.stringify({
          orderVersion: saved.orderVersion,
          roomIds,
        }),
      });
      expect(invalidResponse.status).toBe(400);
      expect((await invalidResponse.json() as { code: string }).code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("recurrence search contract", () => {
  it("searches purpose, applicant name, room name and tag name, but not email", async () => {
    await resetProductData();
    const purposeRoom = await insertRoom("ordinary-purpose-room");
    const applicantRoom = await insertRoom("ordinary-applicant-room");
    const roomNeedle = await insertRoom("RoomNeedle Hall");
    const tagRoom = await insertRoom("ordinary-tag-room");
    const emailRoom = await insertRoom("ordinary-email-room");
    const tagId = await insertTag("TagNeedle Blue");
    const purposeId = await insertRecurrence({ roomId: purposeRoom, purpose: "Quarterly PurposeNeedle Review" });
    const applicantId = await insertRecurrence({ roomId: applicantRoom, purpose: "ordinary", applicantName: "ApplicantNeedle Person" });
    const roomId = await insertRecurrence({ roomId: roomNeedle, purpose: "ordinary" });
    const tagRecurrenceId = await insertRecurrence({ roomId: tagRoom, purpose: "ordinary", tagId });
    await insertRecurrence({ roomId: emailRoom, purpose: "ordinary", applicantEmail: "EmailNeedle@example.test" });

    for (const [keyword, expectedId] of [
      ["poseneed", purposeId], ["PLICANTneedle", applicantId], ["roomneedle", roomId], ["tagneedle", tagRecurrenceId],
    ]) {
      const result = await products.listRecurrences(parseRecurrenceList(
        new URL(`http://worker.test/api/admin/recurrences?keyword=${keyword}`).searchParams,
      ));
      expect(result.totalItems).toBe(1);
      expect(result.items[0]?.id).toBe(expectedId);
    }
    const emailOnly = await products.listRecurrences(parseRecurrenceList(
      new URL("http://worker.test/api/admin/recurrences?keyword=emailneedle").searchParams,
    ));
    expect(emailOnly.totalItems).toBe(0);
  });

  it("keeps the same search set with filters, pagination and createdAt descending order", async () => {
    await resetProductData();
    const roomId = await insertRoom("ordinary-filter-room");
    const older = await insertRecurrence({ roomId, purpose: "FilterNeedle older", createdAt: "2026-01-01T00:00:00Z" });
    const newer = await insertRecurrence({ roomId, purpose: "FilterNeedle newer", createdAt: "2026-01-02T00:00:00Z" });
    const latest = await insertRecurrence({ roomId, purpose: "FilterNeedle latest", createdAt: "2026-01-03T00:00:00Z" });
    const date = futureWeekday(35, 10).slice(0, 10);
    const url = new URL(`http://worker.test/api/admin/recurrences?keyword=filterneedle&roomId=${roomId}&fromDate=${date}&toDate=${date}&page=0&size=1`);
    const first = await products.listRecurrences(parseRecurrenceList(url.searchParams));
    expect(first).toMatchObject({ page: 0, size: 1, totalItems: 3, totalPages: 3 });
    expect(first.items[0]?.id).toBe(latest);
    url.searchParams.set("page", "1");
    expect((await products.listRecurrences(parseRecurrenceList(url.searchParams))).items[0]?.id).toBe(newer);
    url.searchParams.set("page", "2");
    expect((await products.listRecurrences(parseRecurrenceList(url.searchParams))).items[0]?.id).toBe(older);
  });
});

describe("recurrence hard-delete contract", () => {
  it("deletes every linked reservation and preserves per-reservation audit snapshots", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-recurrence-hard-delete");
    const recurrenceId = await insertRecurrence({ roomId, purpose: "testing-recurring-hard-delete" });
    const reservations = await Promise.all([
      insertReservation({ roomId, recurrenceId, hour: 9, purpose: "testing-unmodified-confirmed", status: "CONFIRMED", source: "RECURRING_GENERATED" }),
      insertReservation({ roomId, recurrenceId, hour: 10, purpose: "testing-modified-confirmed", status: "CONFIRMED", source: "RECURRING_GENERATED", recurrenceException: true }),
      insertReservation({ roomId, recurrenceId, hour: 11, purpose: "testing-requested", status: "REQUESTED", source: "RECURRING_GENERATED" }),
      insertReservation({ roomId, recurrenceId, hour: 12, purpose: "testing-cancelled", status: "CANCELLED", source: "RECURRING_GENERATED" }),
      insertReservation({ roomId, recurrenceId, hour: 13, purpose: "testing-exception-true", status: "CANCELLED", source: "RECURRING_GENERATED", recurrenceException: true }),
      insertReservation({ roomId, recurrenceId, hour: 14, purpose: "testing-exception-false", status: "CONFIRMED", source: "RECURRING_GENERATED", recurrenceException: false }),
    ]);
    for (const reservationId of reservations) {
      await database.query(
        `INSERT INTO reservation_histories(
           reservation_id,action,actor_type,reservation_room_id,reservation_purpose,reservation_room_name
         ) SELECT id,'RECURRENCE_GENERATED','ADMIN',room_id,purpose,'testing-room-recurrence-hard-delete'
           FROM reservations WHERE id=$1`,
        [reservationId],
      );
    }
    await database.query(
      `INSERT INTO reservation_histories(
         reservation_id,action,actor_type,reservation_room_id,reservation_purpose,reservation_room_name
       ) SELECT id,'UPDATED','ADMIN',room_id,purpose,'testing-room-recurrence-hard-delete'
         FROM reservations WHERE id=$1`,
      [reservations[1]],
    );

    const { app, writeHeaders } = await authenticatedApp();
    const deleted = await app.request(`http://worker.test/api/admin/recurrences/${recurrenceId}`, {
      method: "DELETE",
      headers: writeHeaders,
      body: JSON.stringify({ memo: "testing-recurrence-hard-delete-memo" }),
    });
    expect(deleted.status).toBe(204);
    expect((await database.query("SELECT 1 FROM reservation_recurrences WHERE id=$1", [recurrenceId])).rows).toHaveLength(0);
    expect((await database.query("SELECT 1 FROM reservations WHERE id=ANY($1::uuid[])", [reservations])).rows).toHaveLength(0);
    expect((await database.query(
      `SELECT 1 FROM reservations r
       LEFT JOIN reservation_recurrences rr ON rr.id=r.recurrence_id
       WHERE r.recurrence_id IS NOT NULL AND rr.id IS NULL`,
    )).rows).toHaveLength(0);

    const histories = await database.query(
      `SELECT reservation_id,reservation_deleted_id,action,memo
       FROM reservation_histories WHERE reservation_deleted_id=ANY($1::uuid[])`,
      [reservations],
    );
    for (const reservationId of reservations) {
      const reservationHistories = histories.rows.filter((row) => row.reservation_deleted_id === reservationId);
      expect(reservationHistories.some((row) => row.action === "DELETED" && row.memo === "testing-recurrence-hard-delete-memo")).toBe(true);
      expect(reservationHistories.some((row) => row.action === "RECURRENCE_GENERATED")).toBe(true);
      expect(reservationHistories.every((row) => row.reservation_id === null)).toBe(true);
    }
    expect(histories.rows.some((row) => row.action === "RECURRENCE_CANCELLED")).toBe(false);

    const repeated = await app.request(`http://worker.test/api/admin/recurrences/${recurrenceId}`, {
      method: "DELETE",
      headers: writeHeaders,
      body: JSON.stringify({}),
    });
    expect(repeated.status).toBe(404);
    const legacyCancel = await app.request(`http://worker.test/api/admin/recurrences/${recurrenceId}/cancel`, {
      method: "POST",
      headers: writeHeaders,
    });
    expect(legacyCancel.status).toBe(404);
  });

  it("rolls back the group, reservations and histories when a child delete fails", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-recurrence-delete-rollback");
    const recurrenceId = await insertRecurrence({ roomId, purpose: "testing-recurrence-delete-rollback" });
    const first = await insertReservation({ roomId, recurrenceId, hour: 9, purpose: "testing-delete-rollback-first" });
    const second = await insertReservation({ roomId, recurrenceId, hour: 10, purpose: "testing-delete-rollback-second" });
    for (const reservationId of [first, second]) {
      await database.query(
        `INSERT INTO reservation_histories(reservation_id,action,actor_type)
         VALUES($1,'RECURRENCE_GENERATED','ADMIN')`,
        [reservationId],
      );
    }
    await database.query(`CREATE FUNCTION fail_testing_recurrence_child_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.id = '${second}'::uuid THEN
          RAISE EXCEPTION 'testing recurrence child delete failure';
        END IF;
        RETURN OLD;
      END $$`);
    await database.query(
      `CREATE TRIGGER trg_fail_testing_recurrence_child_delete
       BEFORE DELETE ON reservations
       FOR EACH ROW EXECUTE FUNCTION fail_testing_recurrence_child_delete()`,
    );
    try {
      await expect(products.deleteRecurrence(recurrenceId, "testing-rollback", "admin"))
        .rejects.toThrow("testing recurrence child delete failure");
    } finally {
      await database.query("DROP TRIGGER IF EXISTS trg_fail_testing_recurrence_child_delete ON reservations");
      await database.query("DROP FUNCTION IF EXISTS fail_testing_recurrence_child_delete()");
    }
    expect((await database.query("SELECT 1 FROM reservation_recurrences WHERE id=$1", [recurrenceId])).rows).toHaveLength(1);
    expect((await database.query("SELECT id FROM reservations WHERE id=ANY($1::uuid[])", [[first, second]])).rows).toHaveLength(2);
    expect((await database.query(
      "SELECT 1 FROM reservation_histories WHERE reservation_deleted_id=ANY($1::uuid[]) OR action='DELETED'",
      [[first, second]],
    )).rows).toHaveLength(0);
    expect((await database.query(
      "SELECT 1 FROM reservation_histories WHERE reservation_id=ANY($1::uuid[])",
      [[first, second]],
    )).rows).toHaveLength(2);
  });

  it("completes concurrent room and recurrence hard deletes without a lock-order deadlock", async () => {
    await resetProductData();
    const roomName = "testing-room-concurrent-recurrence-delete";
    const roomId = await insertRoom(roomName);
    const recurrenceId = await insertRecurrence({
      roomId,
      purpose: "testing-concurrent-recurrence-delete",
    });
    const recurringReservationId = await insertReservation({
      roomId,
      recurrenceId,
      purpose: "testing-concurrent-recurring-reservation",
      source: "RECURRING_GENERATED",
    });
    const ordinaryReservationId = await insertReservation({
      roomId,
      purpose: "testing-concurrent-ordinary-reservation",
      hour: 12,
    });
    for (const [reservationId, action] of [
      [recurringReservationId, "RECURRENCE_GENERATED"],
      [ordinaryReservationId, "CREATED_BY_ADMIN"],
    ]) {
      await database.query(
        `INSERT INTO reservation_histories(
         reservation_id,action,actor_type,reservation_room_id,reservation_purpose,reservation_room_name
         ) SELECT id,$2,'ADMIN',room_id,purpose,$3
           FROM reservations WHERE id=$1`,
        [reservationId, action, roomName],
      );
    }
    await database.query(`CREATE FUNCTION pause_testing_room_reservation_move() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.room_id = '${roomId}'::uuid AND NEW.room_id IS DISTINCT FROM OLD.room_id THEN
          PERFORM pg_sleep(0.5);
        END IF;
        RETURN NEW;
      END $$`);
    await database.query(
      `CREATE TRIGGER trg_pause_testing_room_reservation_move
       AFTER UPDATE OF room_id ON reservations
       FOR EACH ROW EXECUTE FUNCTION pause_testing_room_reservation_move()`,
    );

    let results: PromiseSettledResult<void>[] = [];
    try {
      const roomDelete = products.deleteRoom(roomId);
      await new Promise((resolve) => setTimeout(resolve, 100));
      results = await Promise.allSettled([
        roomDelete,
        products.deleteRecurrence(recurrenceId, "testing-concurrent-delete", "admin"),
      ]);
    } finally {
      await database.query("DROP TRIGGER IF EXISTS trg_pause_testing_room_reservation_move ON reservations");
      await database.query("DROP FUNCTION IF EXISTS pause_testing_room_reservation_move()");
    }

    expect(results).toEqual([
      { status: "fulfilled", value: undefined },
      { status: "fulfilled", value: undefined },
    ]);
    expect((await database.query("SELECT 1 FROM rooms WHERE id=$1", [roomId])).rows).toHaveLength(0);
    expect((await database.query("SELECT 1 FROM reservation_recurrences WHERE id=$1", [recurrenceId])).rows).toHaveLength(0);
    expect((await database.query("SELECT 1 FROM reservations WHERE id=$1", [recurringReservationId])).rows).toHaveLength(0);

    const ordinaryReservation = (await database.query(
      `SELECT r.original_room_name,rm.system_reserved
       FROM reservations r JOIN rooms rm ON rm.id=r.room_id
       WHERE r.id=$1`,
      [ordinaryReservationId],
    )).rows[0];
    expect(ordinaryReservation).toEqual({ original_room_name: roomName, system_reserved: true });
    const deletedHistories = await database.query(
      `SELECT action,memo,reservation_room_name,reservation_id
       FROM reservation_histories WHERE reservation_deleted_id=$1
       ORDER BY created_at ASC,id ASC`,
      [recurringReservationId],
    );
    expect(deletedHistories.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "RECURRENCE_GENERATED",
        reservation_room_name: roomName,
        reservation_id: null,
      }),
      expect.objectContaining({
        action: "DELETED",
        memo: "testing-concurrent-delete",
        reservation_room_name: roomName,
        reservation_id: null,
      }),
    ]));
    expect((await database.query(
      `SELECT 1 FROM reservation_histories
       WHERE reservation_id=$1 AND reservation_room_name=$2`,
      [ordinaryReservationId, roomName],
    )).rows).toHaveLength(1);
    expect((await database.query(
      `SELECT 1 FROM reservations r
       LEFT JOIN reservation_recurrences rr ON rr.id=r.recurrence_id
       WHERE r.recurrence_id IS NOT NULL AND rr.id IS NULL`,
    )).rows).toHaveLength(0);
  }, 15_000);
});

describe("E2E cleanup ownership closure", () => {
  it("uses one ownership set for preview/execute, preserves unrelated rows and reports real skips", async () => {
    await resetProductData();
    const testingRoom = await insertRoom("testing-room-owned");
    const ordinaryRoom = await insertRoom("ordinary-room-preserved");
    const markerTag = await insertTag("testing-tag-skipped");
    const ordinaryTagBlocker = await insertRecurrence({ roomId: ordinaryRoom, purpose: "ordinary blocker", tagId: markerTag });
    const roomOwnedRecurrence = await insertRecurrence({ roomId: testingRoom, purpose: "ordinary recurrence in testing room" });
    const roomOwnedReservation = await insertReservation({ roomId: testingRoom, purpose: "ordinary reservation in testing room", hour: 10 });
    const markerRecurrence = await insertRecurrence({ roomId: ordinaryRoom, purpose: "testing-recurring-owned" });
    const generatedReservation = await insertReservation({ roomId: ordinaryRoom, purpose: "ordinary generated child", recurrenceId: markerRecurrence, hour: 11 });
    const directReservation = await insertReservation({ roomId: ordinaryRoom, purpose: "testing-reservation-direct", hour: 12 });
    const ordinaryReservation = await insertReservation({ roomId: ordinaryRoom, purpose: "ordinary-preserved", hour: 13 });
    for (const reservationId of [roomOwnedReservation, generatedReservation, directReservation]) {
      await database.query(
        `INSERT INTO reservation_histories(
           reservation_id,action,actor_type,reservation_room_id,reservation_purpose,reservation_room_name
         ) SELECT id,'CREATED','ADMIN',room_id,purpose,'snapshot' FROM reservations WHERE id=$1`,
        [reservationId],
      );
    }

    const preview = await products.cleanupE2e("testing-", true);
    expect(preview).toMatchObject({
      reservationHistoriesDeleted: 3, reservationsDeleted: 3, recurrencesDeleted: 2,
      tagsDeleted: 0, tagsSkipped: 1, roomsDeleted: 1, roomsSkipped: 0,
    });
    const executed = await products.cleanupE2e("testing-", false);
    expect({ ...executed, dryRun: true }).toEqual(preview);
    expect((await database.query("SELECT 1 FROM reservations WHERE id=ANY($1::uuid[])", [[roomOwnedReservation, generatedReservation, directReservation]])).rows).toHaveLength(0);
    expect((await database.query("SELECT 1 FROM reservation_recurrences WHERE id=ANY($1::uuid[])", [[roomOwnedRecurrence, markerRecurrence]])).rows).toHaveLength(0);
    expect((await database.query("SELECT 1 FROM reservation_histories")).rows).toHaveLength(0);
    expect((await database.query("SELECT 1 FROM reservations WHERE id=$1", [ordinaryReservation])).rows).toHaveLength(1);
    expect((await database.query("SELECT 1 FROM reservation_recurrences WHERE id=$1", [ordinaryTagBlocker])).rows).toHaveLength(1);
    expect((await database.query("SELECT 1 FROM tags WHERE id=$1", [markerTag])).rows).toHaveLength(1);

    await database.query("DELETE FROM reservation_recurrences WHERE id=$1", [ordinaryTagBlocker]);
    const residualCleanup = await products.cleanupE2e("testing-", false);
    expect(residualCleanup).toMatchObject({ tagsDeleted: 1, tagsSkipped: 0 });
    const residual = await database.query(
      `SELECT
        (SELECT count(*) FROM rooms WHERE lower(name) LIKE 'testing-%')::int
        +(SELECT count(*) FROM tags WHERE lower(name) LIKE 'testing-%')::int
        +(SELECT count(*) FROM reservations WHERE lower(purpose) LIKE 'testing-%' OR lower(applicant_name) LIKE 'testing-%' OR lower(applicant_email) LIKE 'testing-%')::int
        +(SELECT count(*) FROM reservation_recurrences WHERE lower(purpose) LIKE 'testing-%' OR lower(applicant_name) LIKE 'testing-%' OR lower(applicant_email) LIKE 'testing-%')::int AS total`,
    );
    expect(Number(residual.rows[0]?.total)).toBe(0);
  });
});

describe("direct Worker contracts", () => {
  it("skips admin no-op updates and preserves accurate room names in audit snapshots", async () => {
    await resetProductData();
    const firstRoomId = await insertRoom("testing-room-audit-first");
    const secondRoomId = await insertRoom("testing-room-audit-second");
    const startAt = futureWeekday(21, 10);
    const basePayload = {
      roomId: firstRoomId,
      applicantName: "testing-admin-audit",
      applicantEmail: null,
      applicantPhone: "010-1234-5678",
      purpose: "testing-admin-audit-purpose",
      startAt,
      endAt: addHour(startAt),
      status: "CONFIRMED",
      showApplicantName: true,
    };
    const created = await products.createAdminReservation(parseAdminReservation(basePayload), "admin");
    const beforeNoOp = (await database.query(
      "SELECT updated_at, updated_by_actor_type, updated_by_actor_id, recurrence_exception FROM reservations WHERE id=$1",
      [created.id],
    )).rows[0]!;
    const historyCount = Number((await database.query(
      "SELECT count(*) AS count FROM reservation_histories WHERE reservation_id=$1",
      [created.id],
    )).rows[0]?.count);
    expect((await database.query(
      `SELECT action, reservation_room_name, before_reservation_room_name
       FROM reservation_histories WHERE reservation_id=$1 ORDER BY created_at ASC, id ASC LIMIT 1`,
      [created.id],
    )).rows[0]).toEqual({
      action: "CREATED_BY_ADMIN",
      reservation_room_name: "testing-room-audit-first",
      before_reservation_room_name: null,
    });

    await products.updateAdminReservation(created.id, parseAdminReservation({ ...basePayload, memo: "   " }), "other-admin");

    const afterNoOp = (await database.query(
      "SELECT updated_at, updated_by_actor_type, updated_by_actor_id, recurrence_exception FROM reservations WHERE id=$1",
      [created.id],
    )).rows[0]!;
    expect(afterNoOp).toEqual(beforeNoOp);
    expect(Number((await database.query(
      "SELECT count(*) AS count FROM reservation_histories WHERE reservation_id=$1",
      [created.id],
    )).rows[0]?.count)).toBe(historyCount);

    await products.updateAdminReservation(created.id, parseAdminReservation({
      ...basePayload,
      memo: "testing-admin-memo-only",
    }), "admin");
    let latestHistory = (await database.query(
      `SELECT action, memo, reservation_room_name, before_reservation_room_name
       FROM reservation_histories WHERE reservation_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [created.id],
    )).rows[0];
    expect(latestHistory).toEqual({
      action: "UPDATED",
      memo: "testing-admin-memo-only",
      reservation_room_name: "testing-room-audit-first",
      before_reservation_room_name: "testing-room-audit-first",
    });

    await products.updateAdminReservation(created.id, parseAdminReservation({
      ...basePayload,
      purpose: "testing-admin-audit-purpose-updated",
    }), "admin");
    latestHistory = (await database.query(
      `SELECT reservation_room_name, before_reservation_room_name
       FROM reservation_histories WHERE reservation_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [created.id],
    )).rows[0];
    expect(latestHistory).toEqual({
      reservation_room_name: "testing-room-audit-first",
      before_reservation_room_name: "testing-room-audit-first",
    });

    await products.updateAdminReservation(created.id, parseAdminReservation({
      ...basePayload,
      roomId: secondRoomId,
      purpose: "testing-admin-audit-purpose-updated",
    }), "admin");
    latestHistory = (await database.query(
      `SELECT reservation_room_name, before_reservation_room_name
       FROM reservation_histories WHERE reservation_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [created.id],
    )).rows[0];
    expect(latestHistory).toEqual({
      reservation_room_name: "testing-room-audit-second",
      before_reservation_room_name: "testing-room-audit-first",
    });

    await products.changeReservationStatus(created.id, "CANCELLED", "testing-admin-cancel", "admin");
    latestHistory = (await database.query(
      `SELECT reservation_room_name, before_reservation_room_name
       FROM reservation_histories WHERE reservation_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [created.id],
    )).rows[0];
    expect(latestHistory).toEqual({
      reservation_room_name: "testing-room-audit-second",
      before_reservation_room_name: "testing-room-audit-second",
    });

    const deletedRoomId = await insertRoom("testing-room-audit-deleted");
    const deletedStartAt = futureWeekday(21, 12);
    const deletedReservation = await products.createAdminReservation(parseAdminReservation({
      ...basePayload,
      roomId: deletedRoomId,
      startAt: deletedStartAt,
      endAt: addHour(deletedStartAt),
      purpose: "testing-admin-deleted-room",
    }), "admin");
    await products.deleteRoom(deletedRoomId);
    await products.changeReservationStatus(deletedReservation.id, "CANCELLED", null, "admin");
    latestHistory = (await database.query(
      `SELECT reservation_room_name, before_reservation_room_name
       FROM reservation_histories WHERE reservation_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [deletedReservation.id],
    )).rows[0];
    expect(latestHistory).toEqual({
      reservation_room_name: "testing-room-audit-deleted",
      before_reservation_room_name: "testing-room-audit-deleted",
    });
  });

  it("keeps recurrence-derived reservations unchanged on an admin no-op save", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-recurrence-no-op");
    const date = futureWeekday(35, 10).slice(0, 10);
    const recurrence = await products.createRecurrence(parseRecurrenceCreate({
      roomId,
      applicantName: "testing-recurrence-no-op",
      applicantEmail: null,
      applicantPhone: "010-0000-0000",
      purpose: "testing-recurrence-no-op",
      tagId: null,
      startDate: date,
      endDate: date,
      daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
      startTime: "10:00",
      endTime: "11:00",
      conflictPolicy: "FAIL_ALL",
      showApplicantName: false,
    }), "admin");
    const child = (await database.query(
      `SELECT id, room_id, applicant_name, applicant_email, applicant_phone, purpose,
        start_at, end_at, status, show_applicant_name, recurrence_exception, updated_at
       FROM reservations WHERE recurrence_id=$1`,
      [recurrence.recurrenceId],
    )).rows[0]!;
    const historyCount = Number((await database.query(
      "SELECT count(*) AS count FROM reservation_histories WHERE reservation_id=$1",
      [child.id],
    )).rows[0]?.count);
    expect((await database.query(
      "SELECT reservation_room_name FROM reservation_histories WHERE reservation_id=$1",
      [child.id],
    )).rows[0]).toEqual({ reservation_room_name: "testing-room-recurrence-no-op" });

    await products.updateAdminReservation(String(child.id), parseAdminReservation({
      roomId: String(child.room_id),
      applicantName: String(child.applicant_name),
      applicantEmail: child.applicant_email,
      applicantPhone: child.applicant_phone,
      purpose: String(child.purpose),
      startAt: new Date(String(child.start_at)).toISOString(),
      endAt: new Date(String(child.end_at)).toISOString(),
      status: String(child.status),
      showApplicantName: Boolean(child.show_applicant_name),
      memo: "",
    }), "admin");

    const after = (await database.query(
      "SELECT recurrence_exception, updated_at FROM reservations WHERE id=$1",
      [child.id],
    )).rows[0];
    expect(after).toEqual({ recurrence_exception: child.recurrence_exception, updated_at: child.updated_at });
    expect(Number((await database.query(
      "SELECT count(*) AS count FROM reservation_histories WHERE reservation_id=$1",
      [child.id],
    )).rows[0]?.count)).toBe(historyCount);
  });

  it("skips true public no-op updates but preserves the CONFIRMED to REQUESTED transition", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-public-no-op");
    const password = "NoOp1!";
    const payload = publicPayload(roomId, password, "testing-public-no-op", 10);
    const created = await products.createPublicReservation(parsePublicReservation(payload));
    const beforeNoOp = (await database.query(
      "SELECT updated_at, updated_by_actor_type, updated_by_actor_id, recurrence_exception FROM reservations WHERE id=$1",
      [created.id],
    )).rows[0]!;
    const historyCount = Number((await database.query(
      "SELECT count(*) AS count FROM reservation_histories WHERE reservation_id=$1",
      [created.id],
    )).rows[0]?.count);

    await products.updatePublicReservation(created.id, parsePublicReservation(payload));

    expect((await database.query(
      "SELECT updated_at, updated_by_actor_type, updated_by_actor_id, recurrence_exception FROM reservations WHERE id=$1",
      [created.id],
    )).rows[0]).toEqual(beforeNoOp);
    expect(Number((await database.query(
      "SELECT count(*) AS count FROM reservation_histories WHERE reservation_id=$1",
      [created.id],
    )).rows[0]?.count)).toBe(historyCount);

    await products.changeReservationStatus(created.id, "APPROVED", "testing-public-approve", "admin");
    await products.updatePublicReservation(created.id, parsePublicReservation(payload));
    const afterTransition = await products.getReservationDetail(created.id);
    expect(afterTransition.status).toBe("REQUESTED");
    const updatedHistory = (await database.query(
      `SELECT action, before_status, after_status, reservation_room_name, before_reservation_room_name
       FROM reservation_histories WHERE reservation_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [created.id],
    )).rows[0];
    expect(updatedHistory).toEqual({
      action: "UPDATED",
      before_status: "CONFIRMED",
      after_status: "REQUESTED",
      reservation_room_name: "testing-room-public-no-op",
      before_reservation_room_name: "testing-room-public-no-op",
    });
  });

  it("limits the public intake toggle to public create and update flows", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-public-intake-toggle");
    const password = "Toggle1!";
    const existingPublicPayload = publicPayload(roomId, password, "testing-public-before-disabled", 10);
    const existingPublic = await products.createPublicReservation(parsePublicReservation(existingPublicPayload));

    await database.query(
      `UPDATE operation_settings
       SET reservation_enabled=false,
           reservation_disabled_message='testing-public-intake-disabled'`,
    );

    await expect(products.createPublicReservation(parsePublicReservation(
      publicPayload(roomId, password, "testing-public-create-disabled", 11),
    ))).rejects.toMatchObject({ kind: "POLICY_VIOLATION", code: "RESERVATION_DISABLED" });
    const publicUpdateStartAt = futureWeekday(21, 12);
    await expect(products.updatePublicReservation(existingPublic.id, parsePublicReservation({
      ...existingPublicPayload,
      purpose: "testing-public-update-disabled",
      startAt: publicUpdateStartAt,
      endAt: addHour(publicUpdateStartAt),
    }))).rejects.toMatchObject({ kind: "POLICY_VIOLATION", code: "RESERVATION_DISABLED" });
    await expect(products.updatePublicReservation(
      existingPublic.id,
      parsePublicReservation({ ...existingPublicPayload, purpose: "testing-public-text-update-disabled" }),
    )).resolves.toMatchObject({ purpose: "testing-public-text-update-disabled" });

    const adminStartAt = futureWeekday(21, 13);
    const adminCreated = await products.createAdminReservation(parseAdminReservation({
      roomId,
      applicantName: "testing-admin-toggle",
      applicantEmail: null,
      applicantPhone: null,
      purpose: "testing-admin-create-disabled",
      startAt: adminStartAt,
      endAt: addHour(adminStartAt),
      status: "CONFIRMED",
    }), "admin");
    expect(adminCreated).toMatchObject({ purpose: "testing-admin-create-disabled" });

    const adminUpdatedStartAt = futureWeekday(21, 14);
    await expect(products.updateAdminReservation(adminCreated.id, parseAdminReservation({
      roomId,
      applicantName: "testing-admin-toggle",
      applicantEmail: null,
      applicantPhone: null,
      purpose: "testing-admin-update-disabled",
      startAt: adminUpdatedStartAt,
      endAt: addHour(adminUpdatedStartAt),
      status: "CONFIRMED",
    }), "admin")).resolves.toMatchObject({ purpose: "testing-admin-update-disabled" });

    const recurrenceDate = futureWeekday(70, 15).slice(0, 10);
    const recurrence = await products.createRecurrence(parseRecurrenceCreate({
      roomId,
      applicantName: "testing-admin-recurring-toggle",
      applicantEmail: null,
      applicantPhone: null,
      purpose: "testing-recurring-create-disabled",
      tagId: null,
      startDate: recurrenceDate,
      endDate: recurrenceDate,
      daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
      startTime: "15:00",
      endTime: "16:00",
      conflictPolicy: "FAIL_ALL",
    }), "admin");
    expect(recurrence).toMatchObject({ createdCount: 1, skippedCount: 0 });
  });

  it("stores optional admin contacts as NULL while public create and update remain strict", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-optional-contact");
    const { app, cookie, writeHeaders } = await authenticatedApp();
    const adminStartAt = futureWeekday(42, 10);
    const adminPayload = {
      roomId,
      applicantName: "testing-admin-no-contact",
      applicantEmail: null,
      applicantPhone: null,
      purpose: "testing-admin-optional-contact",
      startAt: adminStartAt,
      endAt: addHour(adminStartAt),
      status: "CONFIRMED",
    };
    const adminCreate = await app.request("http://worker.test/api/admin/reservations", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify(adminPayload),
    });
    expect(adminCreate.status).toBe(201);
    const adminReservation = await adminCreate.json() as { id: string; applicantEmail: string | null; applicantPhone: string | null };
    expect(adminReservation).toMatchObject({ applicantEmail: null, applicantPhone: null });
    await expect(database.query(
      "UPDATE reservations SET applicant_email='   ' WHERE id=$1",
      [adminReservation.id],
    )).rejects.toMatchObject({ code: "23514" });

    const adminList = await app.request(
      "http://worker.test/api/admin/reservations?keyword=testing-admin-no-contact",
      { headers: { cookie } },
    );
    expect(adminList.status).toBe(200);
    expect((await adminList.json() as { items: Array<{ applicantEmail: string | null }> }).items[0]?.applicantEmail).toBeNull();
    const adminDetail = await app.request(
      `http://worker.test/api/admin/reservations/${adminReservation.id}`,
      { headers: { cookie } },
    );
    expect(await adminDetail.json()).toMatchObject({ applicantEmail: null, applicantPhone: null });
    const adminHistory = await app.request(
      `http://worker.test/api/admin/reservations/${adminReservation.id}/histories`,
      { headers: { cookie } },
    );
    expect((await adminHistory.json() as Array<{ reservationApplicantEmail: string | null }>)[0]?.reservationApplicantEmail).toBeNull();
    const csvResponse = await app.request(
      "http://worker.test/api/admin/exports/reservations.csv?keyword=testing-admin-no-contact",
      { headers: { cookie } },
    );
    const csv = await csvResponse.text();
    expect(csv).toContain(`testing-admin-no-contact,,,testing-admin-optional-contact`);

    const password = "Public1!";
    const publicRequest = publicPayload(roomId, password, "testing-public-contact-removal", 12);
    for (const missingField of ["applicantEmail", "applicantPhone"] as const) {
      const invalid = { ...publicRequest } as Record<string, unknown>;
      delete invalid[missingField];
      const response = await app.request("http://worker.test/api/public/reservations", {
        method: "POST",
        headers: writeHeaders,
        body: JSON.stringify(invalid),
      });
      expect(response.status).toBe(400);
    }
    const publicCreate = await app.request("http://worker.test/api/public/reservations", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify(publicRequest),
    });
    expect(publicCreate.status).toBe(201);
    const publicReservation = await publicCreate.json() as { id: string };
    const adminErase = await app.request(
      `http://worker.test/api/admin/reservations/${publicReservation.id}`,
      {
        method: "PUT",
        headers: writeHeaders,
        body: JSON.stringify({
          ...publicRequest,
          applicantEmail: "   ",
          applicantPhone: "",
          status: "REQUESTED",
        }),
      },
    );
    expect(adminErase.status).toBe(200);
    expect(await adminErase.json()).toMatchObject({ applicantEmail: null, applicantPhone: null });
    const verified = await app.request(
      `http://worker.test/api/public/reservations/${publicReservation.id}/edit`,
      {
        method: "POST",
        headers: writeHeaders,
        body: JSON.stringify({ cancelPassword: password }),
      },
    );
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ applicantEmail: null, applicantPhone: null });
    for (const missingField of ["applicantEmail", "applicantPhone"] as const) {
      const invalid = { ...publicRequest } as Record<string, unknown>;
      delete invalid[missingField];
      const response = await app.request(
        `http://worker.test/api/public/reservations/${publicReservation.id}`,
        {
          method: "PUT",
          headers: writeHeaders,
          body: JSON.stringify(invalid),
        },
      );
      expect(response.status).toBe(400);
    }

    const recurrenceDate = futureWeekday(63, 10).slice(0, 10);
    const recurrencePayload = {
      roomId,
      applicantName: "testing-recurring-no-contact",
      applicantEmail: null,
      applicantPhone: null,
      purpose: "testing-recurring-optional-contact",
      tagId: null,
      startDate: recurrenceDate,
      endDate: recurrenceDate,
      daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
      startTime: "14:00",
      endTime: "15:00",
      conflictPolicy: "FAIL_ALL",
    };
    const recurrencePreview = await app.request("http://worker.test/api/admin/recurrences/preview", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify(recurrencePayload),
    });
    expect(recurrencePreview.status).toBe(200);
    const recurrenceCreate = await app.request("http://worker.test/api/admin/recurrences", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify(recurrencePayload),
    });
    expect(recurrenceCreate.status).toBe(201);
    const recurrence = await recurrenceCreate.json() as {
      recurrenceId: string;
      createdCount: number;
      cancelledCount: number;
      skippedCount: number;
      failedCount: number;
    };
    expect(recurrence).toMatchObject({
      createdCount: 1,
      cancelledCount: 0,
      skippedCount: 0,
      failedCount: 0,
    });
    const storedContacts = await database.query(
      `SELECT
         (SELECT applicant_email FROM reservation_recurrences WHERE id=$1) AS recurrence_email,
         (SELECT applicant_phone FROM reservation_recurrences WHERE id=$1) AS recurrence_phone,
         (SELECT applicant_email FROM reservations WHERE recurrence_id=$1 LIMIT 1) AS reservation_email,
         (SELECT applicant_phone FROM reservations WHERE recurrence_id=$1 LIMIT 1) AS reservation_phone`,
      [recurrence.recurrenceId],
    );
    expect(storedContacts.rows[0]).toEqual({
      recurrence_email: null,
      recurrence_phone: null,
      reservation_email: null,
      reservation_phone: null,
    });
    await expect(database.query(
      "UPDATE reservation_recurrences SET applicant_email='   ' WHERE id=$1",
      [recurrence.recurrenceId],
    )).rejects.toMatchObject({ code: "23514" });
    const recurrenceDetail = await app.request(
      `http://worker.test/api/admin/recurrences/${recurrence.recurrenceId}`,
      { headers: { cookie } },
    );
    expect(recurrenceDetail.status).toBe(200);
    expect(await recurrenceDetail.json()).toMatchObject({ applicantEmail: null, applicantPhone: null });
  });

  it("exports the exact BOM CSV contract, all filtered rows, escaping and Seoul timestamps", async () => {
    await resetProductData();
    const roomId = await insertRoom("=ordinary-csv-room");
    const firstId = await insertReservation({
      roomId, purpose: "\t=testing-csv, \"quoted\"\nline", applicantName: "  +CsvNeedle one", hour: 10,
      createdAt: "2026-01-02T00:00:00Z",
    });
    const secondId = await insertReservation({
      roomId, purpose: "testing-csv-second", applicantName: "CsvNeedle two", hour: 11,
      createdAt: "2026-01-01T00:00:00Z",
    });
    await insertReservation({ roomId, purpose: "ordinary-not-exported", applicantName: "other", hour: 12 });
    const { app, cookie } = await authenticatedApp();
    expect((await app.request("http://worker.test/api/admin/exports/reservations.csv")).status).toBe(401);
    const response = await app.request(`http://worker.test/api/admin/exports/reservations.csv?keyword=csvneedle&status=CONFIRMED&roomId=${roomId}&page=99&size=1`, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv;charset=UTF-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="reservations.csv"');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes.slice(3));
    expect(csv.startsWith("reservationId,roomName,applicantName,applicantEmail,applicantPhone,purpose,startAt,endAt,status,source,recurrenceId,createdAt\r\n")).toBe(true);
    expect(csv).toContain(`'=ordinary-csv-room,'  +CsvNeedle one`);
    expect(csv).toContain(`"'\t=testing-csv, ""quoted""\nline"`);
    expect(csv).toContain(firstId);
    expect(csv).toContain(secondId);
    expect(csv.indexOf(firstId)).toBeLessThan(csv.indexOf(secondId));
    expect(csv).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    expect(csv).not.toContain("ordinary-not-exported");
  });

  it("applies page defaults, max clamp and validation errors", async () => {
    await resetProductData();
    await database.query("INSERT INTO tags(name,color) SELECT 'ordinary-page-'||lpad(n::text,3,'0'),'#123456' FROM generate_series(1,105) n");
    const tagQuery = (url: string) => parseTagList(new URL(url).searchParams);
    expect(await products.listTags(tagQuery("http://worker.test/api/admin/tags"))).toMatchObject({ page: 0, size: 20, totalItems: 105, totalPages: 6 });
    expect((await products.listTags(tagQuery("http://worker.test/api/admin/tags?size=100000"))).items).toHaveLength(100);
    await expect(Promise.resolve().then(() => tagQuery("http://worker.test/api/admin/tags?page=-1"))).rejects.toMatchObject({ kind: "VALIDATION", code: "VALIDATION_ERROR" });
    await expect(Promise.resolve().then(() => tagQuery("http://worker.test/api/admin/tags?size=0"))).rejects.toMatchObject({ kind: "VALIDATION", code: "VALIDATION_ERROR" });
    await expect(Promise.resolve().then(() => tagQuery("http://worker.test/api/admin/tags?page=abc"))).rejects.toMatchObject({ kind: "VALIDATION", code: "VALIDATION_ERROR" });
  });

  it("stores and returns recurrence and settings weekdays in canonical order", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-weekday-order");
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 35);
    while (start.getUTCDay() !== 2) start.setUTCDate(start.getUTCDate() + 1);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 2);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const settingsBefore = await products.getSettings();
    const updatedSettings = await products.updateSettings(parseUpdateSettings({
      ...settingsBefore,
      availableDaysOfWeek: ["THU", "TUE", "WED"],
      publicAvailableDaysOfWeek: ["THU", "TUE", "WED"],
    }), "admin");
    expect(updatedSettings.availableDaysOfWeek).toEqual(["TUE", "WED", "THU"]);
    expect(updatedSettings.publicAvailableDaysOfWeek).toEqual(["TUE", "WED", "THU"]);
    expect((await database.query(
      "SELECT available_days_of_week, public_available_days_of_week FROM operation_settings WHERE id=1",
    )).rows).toEqual([{ available_days_of_week: "TUE,WED,THU", public_available_days_of_week: "TUE,WED,THU" }]);

    const recurrence = await products.createRecurrence(parseRecurrenceCreate({
      roomId,
      applicantName: "testing-recurring-weekday-order",
      applicantEmail: "testing-recurring-weekday-order@example.test",
      applicantPhone: null,
      purpose: "testing-recurring-weekday-order",
      tagId: null,
      startDate,
      endDate,
      daysOfWeek: ["THU", "TUE", "WED"],
      startTime: "10:00",
      endTime: "11:00",
      conflictPolicy: "FAIL_ALL",
      showApplicantName: false,
    }), "admin");
    expect(recurrence.createdCount).toBe(3);
    expect((await database.query(
      "SELECT days_of_week FROM reservation_recurrences WHERE id=$1",
      [recurrence.recurrenceId],
    )).rows).toEqual([{ days_of_week: "TUE,WED,THU" }]);
    expect((await database.query(
      "SELECT start_at::date::text AS date FROM reservations WHERE recurrence_id=$1 ORDER BY start_at",
      [recurrence.recurrenceId],
    )).rows.map((row) => row.date)).toEqual([startDate, new Date(start.getTime() + 86_400_000).toISOString().slice(0, 10), endDate]);

    await database.query(
      "UPDATE reservation_recurrences SET days_of_week='THU,TUE,WED' WHERE id=$1",
      [recurrence.recurrenceId],
    );
    const list = await products.listRecurrences(parseRecurrenceList(
      new URLSearchParams("keyword=testing-recurring-weekday-order"),
    ));
    expect(list.items[0]?.daysOfWeek).toBe("TUE,WED,THU");
    expect((await products.getRecurrence(recurrence.recurrenceId)).daysOfWeek).toBe("TUE,WED,THU");

    await database.query(
      "UPDATE operation_settings SET available_days_of_week='THU,TUE,WED', public_available_days_of_week='THU,TUE,WED' WHERE id=1",
    );
    const { app, cookie } = await authenticatedApp();
    const publicSettingsResponse = await app.request("http://worker.test/api/public/settings");
    const adminSettingsResponse = await app.request("http://worker.test/api/admin/settings", {
      headers: { cookie },
    });
    expect(publicSettingsResponse.status).toBe(200);
    expect(adminSettingsResponse.status).toBe(200);
    expect((await publicSettingsResponse.json() as { availableDaysOfWeek: string[] }).availableDaysOfWeek)
      .toEqual(["TUE", "WED", "THU"]);
    expect((await adminSettingsResponse.json() as { availableDaysOfWeek: string[] }).availableDaysOfWeek)
      .toEqual(["TUE", "WED", "THU"]);

    expect(await products.checkAvailability({
      roomId,
      startAt: `${startDate}T12:00:00+09:00`,
      endAt: `${startDate}T13:00:00+09:00`,
    })).toMatchObject({ available: true, reason: null });
    const unavailableDate = new Date(start);
    unavailableDate.setUTCDate(unavailableDate.getUTCDate() - 1);
    expect(await products.checkAvailability({
      roomId,
      startAt: `${unavailableDate.toISOString().slice(0, 10)}T12:00:00+09:00`,
      endAt: `${unavailableDate.toISOString().slice(0, 10)}T13:00:00+09:00`,
    })).toMatchObject({ available: false, reason: "OUTSIDE_OPERATING_DAYS" });
  });

  it("keeps settings updates atomic, detects version conflicts and rejects time precision", async () => {
    await resetProductData();
    const before = await products.getSettings();
    const payload = { ...before, organizationName: "Updated atomically", slotMinutes: 5 };
    await expect(products.updateSettings(parseUpdateSettings({ ...payload, minReservationMinutes: 35, maxReservationMinutes: 30 }), "admin"))
      .rejects.toMatchObject({ kind: "VALIDATION", code: "VALIDATION_ERROR" });
    await expect(Promise.resolve().then(() => parseUpdateSettings({ ...payload, openTime: "09:00:01" })))
      .rejects.toMatchObject({ kind: "VALIDATION", code: "VALIDATION_ERROR" });
    await expect(Promise.resolve().then(() => parseUpdateSettings({ ...payload, openTime: "09:00:00.1" })))
      .rejects.toMatchObject({ kind: "VALIDATION", code: "VALIDATION_ERROR" });
    await expect(products.updateSettings(parseUpdateSettings({ ...payload, openTime: "09:15" }), "admin"))
      .rejects.toMatchObject({ kind: "VALIDATION", code: "VALIDATION_ERROR" });
    await expect(Promise.resolve().then(() => parseUpdateSettings({ ...payload, semesterStartDate: "2026-02-30" })))
      .rejects.toMatchObject({ kind: "VALIDATION", code: "VALIDATION_ERROR" });
    expect(await products.getSettings()).toEqual(before);
    const command = parseUpdateSettings(payload);
    const updated = await products.updateSettings(command, "admin");
    expect(updated).toMatchObject({ organizationName: "Updated atomically", version: 1 });
    await expect(products.updateSettings(command, "admin")).rejects.toMatchObject({ kind: "CONFLICT", code: "VERSION_CONFLICT" });
  });

  it("separates public reservation hours and days from admin operating policy", async () => {
    await resetProductData();
    const existingRoomId = await insertRoom("testing-room-public-schedule-existing");
    const publicRoomId = await insertRoom("testing-room-public-schedule-create");
    const adminRoomId = await insertRoom("testing-room-public-schedule-admin");
    const password = "Schedule1!";
    const existingPayload = publicPayload(existingRoomId, password, "testing-public-schedule-existing", 9);
    const existing = await products.createPublicReservation(parsePublicReservation(existingPayload));
    const before = await products.getSettings();

    const settings = await products.updateSettings(parseUpdateSettings({
      ...before,
      publicOpenTime: "10:00",
      publicCloseTime: "17:00",
      publicAvailableDaysOfWeek: ["FRI", "MON", "WED", "TUE", "THU"],
    }), "admin");
    expect(settings.publicAvailableDaysOfWeek).toEqual(["MON", "TUE", "WED", "THU", "FRI"]);

    await expect(products.createPublicReservation(parsePublicReservation(
      publicPayload(publicRoomId, password, "testing-public-before-open", 9),
    ))).rejects.toMatchObject({ kind: "POLICY_VIOLATION", code: "OUTSIDE_OPERATING_HOURS" });

    const crossingStart = futureWeekday(21, 16).replace("16:00:00", "16:30:00");
    expect(await products.checkAvailability({
      roomId: publicRoomId,
      startAt: crossingStart,
      endAt: new Date(new Date(crossingStart).getTime() + 60 * 60_000).toISOString(),
    })).toMatchObject({ available: false, reason: "OUTSIDE_OPERATING_HOURS" });

    const publicBoundary = publicPayload(publicRoomId, password, "testing-public-boundary", 16);
    await expect(products.createPublicReservation(parsePublicReservation(publicBoundary))).resolves.toMatchObject({
      status: "REQUESTED",
    });

    const adminInsideOperating = futureWeekday(21, 9);
    await expect(products.createAdminReservation(parseAdminReservation({
      roomId: adminRoomId,
      applicantName: "testing-admin-public-limited",
      applicantEmail: null,
      applicantPhone: null,
      purpose: "testing-admin-public-limited",
      startAt: adminInsideOperating,
      endAt: addHour(adminInsideOperating),
      status: "CONFIRMED",
    }), "admin")).resolves.toMatchObject({ status: "CONFIRMED" });

    const outsideOperating = futureWeekday(21, 8);
    await expect(products.createAdminReservation(parseAdminReservation({
      roomId: adminRoomId,
      applicantName: "testing-admin-outside-operating",
      applicantEmail: null,
      applicantPhone: null,
      purpose: "testing-admin-outside-operating",
      startAt: outsideOperating,
      endAt: addHour(outsideOperating),
      status: "CONFIRMED",
    }), "admin")).rejects.toMatchObject({ kind: "POLICY_VIOLATION", code: "OUTSIDE_OPERATING_HOURS" });

    await expect(products.updatePublicReservation(existing.id, parsePublicReservation({
      ...existingPayload,
      purpose: "testing-public-schedule-text-only",
    }))).resolves.toMatchObject({ purpose: "testing-public-schedule-text-only" });
    await expect(products.updatePublicReservation(existing.id, parsePublicReservation({
      ...existingPayload,
      roomId: publicRoomId,
    }))).rejects.toMatchObject({ kind: "POLICY_VIOLATION", code: "OUTSIDE_OPERATING_HOURS" });
    const changedStart = existingPayload.startAt.replace("09:00:00", "09:30:00");
    await expect(products.updatePublicReservation(existing.id, parsePublicReservation({
      ...existingPayload,
      startAt: changedStart,
      endAt: addHour(changedStart),
    }))).rejects.toMatchObject({ kind: "POLICY_VIOLATION", code: "OUTSIDE_OPERATING_HOURS" });

    await expect(products.updateSettings(parseUpdateSettings({
      ...settings,
      publicAvailableDaysOfWeek: ["SUN"],
    }), "admin")).rejects.toMatchObject({ fieldErrors: [{ field: "publicAvailableDaysOfWeek" }] });
    await expect(products.updateSettings(parseUpdateSettings({
      ...settings,
      publicOpenTime: "08:30",
    }), "admin")).rejects.toMatchObject({ fieldErrors: [{ field: "publicOpenTime" }] });
    await expect(products.updateSettings(parseUpdateSettings({
      ...settings,
      publicOpenTime: "16:30",
      publicCloseTime: "17:00",
      minReservationMinutes: 60,
    }), "admin")).rejects.toMatchObject({ fieldErrors: [{ field: "publicCloseTime" }] });
  });

  it("leaves no recurrence, child reservation or history when FAIL_ALL sees one conflict", async () => {
    await resetProductData();
    const roomId = await insertRoom("ordinary-fail-all-room");
    const firstDate = new Date();
    firstDate.setUTCDate(firstDate.getUTCDate() + 35);
    while (firstDate.getUTCDay() !== 1) firstDate.setUTCDate(firstDate.getUTCDate() + 1);
    const secondDate = new Date(firstDate);
    secondDate.setUTCDate(secondDate.getUTCDate() + 7);
    const first = firstDate.toISOString().slice(0, 10);
    const second = secondDate.toISOString().slice(0, 10);
    await database.query(
      `INSERT INTO reservations(room_id,applicant_name,applicant_email,purpose,start_at,end_at,status,source,created_by_actor_type)
       VALUES($1,'blocker','blocker@example.test','ordinary blocker',$2,$3,'CONFIRMED','ADMIN_MANUAL','ADMIN')`,
      [roomId, `${second}T10:00:00+09:00`, `${second}T11:00:00+09:00`],
    );
    const body = {
      roomId, applicantName: "testing-fail-all", applicantEmail: "testing-fail-all@example.test",
      applicantPhone: "010-0000-0000", purpose: "testing-recurring-fail-all", tagId: null,
      startDate: first, endDate: second, daysOfWeek: ["MON"], startTime: "10:00", endTime: "11:00", conflictPolicy: "FAIL_ALL",
    };
    await expect(products.createRecurrence(parseRecurrenceCreate(body), "admin")).rejects.toMatchObject({ kind: "CONFLICT", code: "RECURRENCE_CONFLICT" });
    expect((await database.query("SELECT 1 FROM reservation_recurrences WHERE purpose=$1", [body.purpose])).rows).toHaveLength(0);
    expect((await database.query("SELECT 1 FROM reservations WHERE purpose=$1", [body.purpose])).rows).toHaveLength(0);
    expect((await database.query("SELECT 1 FROM reservation_histories WHERE reservation_purpose=$1", [body.purpose])).rows).toHaveLength(0);
  });

  it("records time conflicts as cancelled while skipping policy violations", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-recurrence-batch");
    const firstDate = new Date();
    firstDate.setUTCDate(firstDate.getUTCDate() + 35);
    while (firstDate.getUTCDay() !== 1) firstDate.setUTCDate(firstDate.getUTCDate() + 1);
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(firstDate);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    await database.query(
      `INSERT INTO reservations(
         room_id,applicant_name,applicant_email,purpose,start_at,end_at,status,source,created_by_actor_type
       ) VALUES
         ($1,'testing-requested','testing-requested@example.test','testing-requested',$2,$3,'REQUESTED','ADMIN_MANUAL','ADMIN'),
         ($1,'testing-confirmed','testing-confirmed@example.test','testing-confirmed',$4,$5,'CONFIRMED','ADMIN_MANUAL','ADMIN'),
         ($1,'testing-cancelled','testing-cancelled@example.test','testing-cancelled',$6,$7,'CANCELLED','ADMIN_MANUAL','ADMIN'),
         ($1,'testing-touching','testing-touching@example.test','testing-touching',$8,$9,'CONFIRMED','ADMIN_MANUAL','ADMIN')`,
      [
        roomId,
        `${dates[0]}T10:00:00+09:00`, `${dates[0]}T11:00:00+09:00`,
        `${dates[1]}T10:30:00+09:00`, `${dates[1]}T11:30:00+09:00`,
        `${dates[2]}T10:00:00+09:00`, `${dates[2]}T11:00:00+09:00`,
        `${dates[3]}T09:00:00+09:00`, `${dates[3]}T10:00:00+09:00`,
      ],
    );

    const preview = await products.previewRecurrence({
      roomId,
      applicantPhone: null,
      startDate: dates[0]!,
      endDate: dates[6]!,
      daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      startTime: "10:00",
      endTime: "11:00",
      conflictPolicy: "SKIP_CONFLICTS",
    });

    expect(preview.items.map(({ date }) => date)).toEqual(dates);
    expect(preview.items.map(({ reason }) => reason)).toEqual([
      "TIME_SLOT_CONFLICT",
      "TIME_SLOT_CONFLICT",
      null,
      null,
      null,
      "OUTSIDE_OPERATING_DAYS",
      "OUTSIDE_OPERATING_DAYS",
    ]);
    expect(preview).toMatchObject({ totalCandidates: 7, availableCount: 3, conflictCount: 4, createAllowed: true });

    const purpose = "testing-recurring-cancelled-conflicts";
    const result = await products.createRecurrence(parseRecurrenceCreate({
      roomId,
      applicantName: "testing-recurrence-admin",
      applicantEmail: "testing-recurrence-admin@example.test",
      applicantPhone: "010-1111-2222",
      purpose,
      tagId: null,
      startDate: dates[0]!,
      endDate: dates[6]!,
      daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      startTime: "10:00",
      endTime: "11:00",
      conflictPolicy: "SKIP_CONFLICTS",
      showApplicantName: true,
    }), "admin");

    expect(result).toMatchObject({
      totalCandidates: 7,
      createdCount: 3,
      cancelledCount: 2,
      skippedCount: 2,
      failedCount: 0,
    });
    expect(result.items.map((item) => [item.status, item.reason])).toEqual([
      ["CANCELLED", "TIME_SLOT_CONFLICT"],
      ["CANCELLED", "TIME_SLOT_CONFLICT"],
      ["CREATED", null],
      ["CREATED", null],
      ["CREATED", null],
      ["SKIPPED", "OUTSIDE_OPERATING_DAYS"],
      ["SKIPPED", "OUTSIDE_OPERATING_DAYS"],
    ]);

    const generated = await database.query(
      `SELECT id,recurrence_id,status,source,(start_at AT TIME ZONE 'Asia/Seoul')::date::text AS date,
         (start_at AT TIME ZONE 'Asia/Seoul')::time::text AS start_time,
         (end_at AT TIME ZONE 'Asia/Seoul')::time::text AS end_time,
         applicant_name,applicant_email,applicant_phone,purpose,show_applicant_name
       FROM reservations WHERE recurrence_id=$1 ORDER BY start_at`,
      [result.recurrenceId],
    );
    expect(generated.rows).toHaveLength(5);
    expect(generated.rows.map((row) => row.status)).toEqual([
      "CANCELLED", "CANCELLED", "CONFIRMED", "CONFIRMED", "CONFIRMED",
    ]);
    expect(generated.rows.map((row) => row.date)).toEqual(dates.slice(0, 5));
    expect(generated.rows.every((row) => (
      row.recurrence_id === result.recurrenceId
      && row.source === "RECURRING_GENERATED"
      && row.start_time === "10:00:00"
      && row.end_time === "11:00:00"
      && row.applicant_name === "testing-recurrence-admin"
      && row.applicant_email === "testing-recurrence-admin@example.test"
      && row.applicant_phone === "01011112222"
      && row.purpose === purpose
      && row.show_applicant_name === true
    ))).toBe(true);

    const blockers = await database.query(
      "SELECT purpose,status FROM reservations WHERE purpose LIKE 'testing-%' AND recurrence_id IS NULL ORDER BY purpose",
    );
    expect(blockers.rows).toEqual(expect.arrayContaining([
      { purpose: "testing-requested", status: "REQUESTED" },
      { purpose: "testing-confirmed", status: "CONFIRMED" },
      { purpose: "testing-cancelled", status: "CANCELLED" },
      { purpose: "testing-touching", status: "CONFIRMED" },
    ]));

    const cancelledHistories = await database.query(
      `SELECT action,after_status,memo,actor_type,actor_id
       FROM reservation_histories
       WHERE reservation_id=ANY($1::uuid[]) ORDER BY reservation_start_at`,
      [generated.rows.filter((row) => row.status === "CANCELLED").map((row) => row.id)],
    );
    expect(cancelledHistories.rows).toEqual([
      {
        action: "RECURRENCE_GENERATED",
        after_status: "CANCELLED",
        memo: "반복 예약 생성 시 시간 충돌로 취소 상태 기록",
        actor_type: "ADMIN",
        actor_id: "admin",
      },
      {
        action: "RECURRENCE_GENERATED",
        after_status: "CANCELLED",
        memo: "반복 예약 생성 시 시간 충돌로 취소 상태 기록",
        actor_type: "ADMIN",
        actor_id: "admin",
      },
    ]);

    const detail = await products.getRecurrence(result.recurrenceId);
    expect(detail.reservations.map((reservation) => reservation.status)).toEqual([
      "CANCELLED", "CANCELLED", "CONFIRMED", "CONFIRMED", "CONFIRMED",
    ]);
    const allReservations = await products.listReservations({
      page: 0, size: 20, offset: 0, keyword: purpose, excludeCancelled: false,
    });
    expect(allReservations.items).toHaveLength(5);
    const timetableReservations = await products.listReservations({
      page: 0, size: 20, offset: 0, keyword: purpose, excludeCancelled: true,
    });
    expect(timetableReservations.items).toHaveLength(3);
    const publicWeek = await products.getWeeklyReservations(roomId, weekStartFor(dates[0]!));
    expect(publicWeek.reservations.filter((reservation) => reservation.purpose === purpose)).toHaveLength(3);
    const csv = await products.exportReservationsCsv({ keyword: purpose, excludeCancelled: false });
    expect(csv.match(/,CANCELLED,RECURRING_GENERATED,/g)).toHaveLength(2);
    expect(csv.match(/,CONFIRMED,RECURRING_GENERATED,/g)).toHaveLength(3);

    await database.query("UPDATE reservations SET status='CANCELLED' WHERE purpose='testing-requested'");
    await expect(database.query(
      `INSERT INTO reservations(
         room_id,applicant_name,applicant_email,purpose,start_at,end_at,status,source,created_by_actor_type
       ) VALUES($1,'testing-replacement','testing-replacement@example.test','testing-replacement',$2,$3,
         'CONFIRMED','ADMIN_MANUAL','ADMIN')`,
      [roomId, `${dates[0]}T10:00:00+09:00`, `${dates[0]}T11:00:00+09:00`],
    )).resolves.toMatchObject({ rowCount: 1 });

    await products.deleteRecurrence(result.recurrenceId, "testing-cleanup", "admin");
    expect((await database.query("SELECT 1 FROM reservations WHERE recurrence_id=$1", [result.recurrenceId])).rows).toHaveLength(0);
    expect((await database.query("SELECT status FROM reservations WHERE purpose='testing-confirmed'")).rows).toEqual([
      { status: "CONFIRMED" },
    ]);
  });

  it("creates a recurrence with only cancelled reservations when every slot conflicts", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-recurrence-all-conflicts");
    const firstDate = new Date();
    firstDate.setUTCDate(firstDate.getUTCDate() + 35);
    while (firstDate.getUTCDay() !== 1) firstDate.setUTCDate(firstDate.getUTCDate() + 1);
    const dates = [0, 1].map((offset) => {
      const date = new Date(firstDate);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    });
    for (const date of dates) {
      await database.query(
        `INSERT INTO reservations(room_id,applicant_name,applicant_email,purpose,start_at,end_at,status,source,created_by_actor_type)
         VALUES($1,'testing-blocker','testing-blocker@example.test','testing-all-conflict-blocker',$2,$3,
           'CONFIRMED','ADMIN_MANUAL','ADMIN')`,
        [roomId, `${date}T10:00:00+09:00`, `${date}T11:00:00+09:00`],
      );
    }

    const command = parseRecurrenceCreate({
      roomId,
      applicantName: "testing-all-conflict-admin",
      applicantEmail: null,
      applicantPhone: null,
      purpose: "testing-recurring-all-conflicts",
      tagId: null,
      startDate: dates[0],
      endDate: dates[1],
      daysOfWeek: ["MON", "TUE"],
      startTime: "10:00",
      endTime: "11:00",
      conflictPolicy: "SKIP_CONFLICTS",
    });
    const preview = await products.previewRecurrence(command);
    expect(preview).toMatchObject({ availableCount: 0, conflictCount: 2, createAllowed: true });
    const result = await products.createRecurrence(command, "admin");
    expect(result).toMatchObject({ createdCount: 0, cancelledCount: 2, skippedCount: 0, failedCount: 0 });
    expect(result.items.map((item) => item.status)).toEqual(["CANCELLED", "CANCELLED"]);
    expect((await database.query(
      "SELECT status FROM reservations WHERE recurrence_id=$1 ORDER BY start_at",
      [result.recurrenceId],
    )).rows).toEqual([{ status: "CANCELLED" }, { status: "CANCELLED" }]);
  });

  it("records an insert-time exclusion conflict as cancelled and continues", async () => {
    await resetProductData();
    const roomId = await insertRoom("testing-room-recurrence-race");
    const firstDate = new Date();
    firstDate.setUTCDate(firstDate.getUTCDate() + 35);
    while (firstDate.getUTCDay() !== 1) firstDate.setUTCDate(firstDate.getUTCDate() + 1);
    const dates = [0, 1].map((offset) => {
      const date = new Date(firstDate);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    });
    let injectConflict = true;
    const racingDatabase: Database = {
      query: (text, values) => database.query(text, values),
      transaction: async (work) => {
        if (injectConflict) {
          injectConflict = false;
          await database.query(
            `INSERT INTO reservations(room_id,applicant_name,applicant_email,purpose,start_at,end_at,status,source,created_by_actor_type)
             VALUES($1,'testing-race-blocker','testing-race-blocker@example.test','testing-race-blocker',$2,$3,
               'CONFIRMED','ADMIN_MANUAL','ADMIN')`,
            [roomId, `${dates[0]}T10:00:00+09:00`, `${dates[0]}T11:00:00+09:00`],
          );
        }
        return database.transaction(work);
      },
    };
    const racingProducts = new ProductService(racingDatabase, () => new Date());
    const result = await racingProducts.createRecurrence(parseRecurrenceCreate({
      roomId,
      applicantName: "testing-race-admin",
      applicantEmail: null,
      applicantPhone: null,
      purpose: "testing-recurring-race",
      tagId: null,
      startDate: dates[0],
      endDate: dates[1],
      daysOfWeek: ["MON", "TUE"],
      startTime: "10:00",
      endTime: "11:00",
      conflictPolicy: "SKIP_CONFLICTS",
    }), "admin");

    expect(result).toMatchObject({ createdCount: 1, cancelledCount: 1, skippedCount: 0, failedCount: 0 });
    expect(result.items.map((item) => item.status)).toEqual(["CANCELLED", "CREATED"]);
    expect((await database.query(
      `SELECT r.status,h.action,h.after_status,h.memo
       FROM reservations r JOIN reservation_histories h ON h.reservation_id=r.id
       WHERE r.recurrence_id=$1 ORDER BY r.start_at`,
      [result.recurrenceId],
    )).rows).toEqual([
      {
        status: "CANCELLED",
        action: "RECURRENCE_GENERATED",
        after_status: "CANCELLED",
        memo: "반복 예약 생성 시 시간 충돌로 취소 상태 기록",
      },
      { status: "CONFIRMED", action: "RECURRENCE_GENERATED", after_status: "CONFIRMED", memo: null },
    ]);
  });
});

describe("input boundaries, cookies and bounded session cleanup", () => {
  it("rejects malformed direct API values as validation 4xx instead of 500", async () => {
    await resetProductData();
    const roomId = await insertRoom("ordinary-validation-room");
    const { app, cookie, writeHeaders } = await authenticatedApp();
    const excessiveRecurrence = await app.request("http://worker.test/api/admin/recurrences/preview", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({
        roomId,
        applicantPhone: null,
        startDate: "2024-02-29",
        endDate: "2025-03-01",
        daysOfWeek: ["MON"],
        startTime: "09:00",
        endTime: "10:00",
        conflictPolicy: "FAIL_ALL",
      }),
    });
    expect(excessiveRecurrence.status).toBe(400);
    expect(await excessiveRecurrence.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: [{ field: "endDate" }],
    });
    const requests = [
      app.request("http://worker.test/api/public/rooms/not-a-uuid"),
      app.request(`http://worker.test/api/public/rooms/${roomId}/weekly-reservations?weekStart=2026-02-30`),
      app.request("http://worker.test/api/public/availability?roomId=bad&startAt=2026-01-01T10:00:00%2B09:00&endAt=2026-01-01T11:00:00%2B09:00"),
      app.request("http://worker.test/api/admin/reservations?roomId=bad", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/reservations?status=BOGUS", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/reservations?source=BOGUS", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/reservations?excludeCancelled=maybe", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/reservations?from=2026-02-30T10:00:00%2B09:00", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/recurrences?fromDate=2026-02-30", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/audit/reservation-histories?action=BOGUS", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/tags?page=1.5", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/rooms/not-a-uuid", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/recurrences/preview", {
        method: "POST", headers: writeHeaders, body: JSON.stringify({
          roomId, applicantPhone: "010", startDate: "2026-01-01", endDate: "2026-01-02",
          daysOfWeek: ["MON"], startTime: "09:00", endTime: "10:00", conflictPolicy: "BOGUS",
        }),
      }),
      app.request("http://worker.test/api/admin/recurrences/preview", {
        method: "POST", headers: writeHeaders, body: JSON.stringify({
          roomId, applicantPhone: "010", startDate: "2026-02-30", endDate: "2026-03-02",
          daysOfWeek: ["MON"], startTime: "09:00", endTime: "10:00", conflictPolicy: "FAIL_ALL",
        }),
      }),
      app.request("http://worker.test/api/admin/recurrences/preview", {
        method: "POST", headers: writeHeaders, body: JSON.stringify({
          roomId, applicantPhone: "010", startDate: "2026-03-02", endDate: "2026-03-02",
          daysOfWeek: ["MON"], startTime: "09:00:00.1", endTime: "10:00", conflictPolicy: "FAIL_ALL",
        }),
      }),
      app.request("http://worker.test/api/public/reservations", {
        method: "POST", headers: writeHeaders, body: JSON.stringify({
          roomId: "not-a-uuid", applicantName: "testing-invalid", applicantEmail: "testing-invalid@example.test",
          applicantPhone: "010", purpose: "testing-invalid", startAt: "2026-03-02T09:00:00+09:00",
          endAt: "2026-03-02T10:00:00+09:00", cancelPassword: "Pass1!",
        }),
      }),
    ];
    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(400);
      expect((await response.json() as { code: string }).code).toBe("VALIDATION_ERROR");
    }
    const removedRecurrenceStateQuery = await app.request(
      "http://worker.test/api/admin/recurrences?status=BOGUS&includeDeleted=maybe",
      { headers: { cookie } },
    );
    expect(removedRecurrenceStateQuery.status).toBe(200);
  });

  it("deletes at most 100 expired sessions while retaining valid sessions", async () => {
    await database.query("DELETE FROM admin_sessions");
    const now = new Date("2026-07-21T00:00:00Z");
    await database.query(
      `INSERT INTO admin_sessions(session_id_hash,csrf_token_hash,expires_at)
       SELECT 'expired-'||lpad(n::text,3,'0'),'csrf', $1::timestamptz - interval '1 minute' FROM generate_series(1,102) n`,
      [now],
    );
    await database.query("INSERT INTO admin_sessions(session_id_hash,csrf_token_hash,expires_at) VALUES('valid-session','csrf',$1)", [new Date(now.getTime() + 60_000)]);
    const boundedSessions = new SessionService(database, () => now);
    await boundedSessions.issue();
    expect(Number((await database.query("SELECT count(*) AS total FROM admin_sessions WHERE expires_at <= $1", [now])).rows[0]?.total)).toBe(2);
    expect((await database.query("SELECT 1 FROM admin_sessions WHERE session_id_hash='valid-session'")).rows).toHaveLength(1);
  });

  it("sets production cookie attributes, verifies CSRF and invalidates logout sessions", async () => {
    await database.query("DELETE FROM admin_sessions");
    const { app, cookie, writeHeaders, csrfResponse, login } = await authenticatedApp("prod");
    const issuedCookies = csrfResponse.headers.get("set-cookie") || "";
    const loginCookies = login.headers.get("set-cookie") || "";
    for (const cookies of [issuedCookies, loginCookies]) {
      expect(cookies).toContain("Secure");
      expect(cookies).toContain("SameSite=Lax");
      expect(cookies).toContain("Path=/");
    }
    const sessionSegment = issuedCookies.slice(issuedCookies.indexOf("ROOM-SESSION="), issuedCookies.indexOf("XSRF-TOKEN="));
    const csrfSegment = issuedCookies.slice(issuedCookies.indexOf("XSRF-TOKEN="));
    expect(sessionSegment).toContain("HttpOnly");
    expect(csrfSegment).not.toContain("HttpOnly");
    expect((await app.request("http://worker.test/api/auth/admin/logout", { method: "POST", headers: { "content-type": "application/json", cookie } })).status).toBe(403);
    expect((await app.request("http://worker.test/api/auth/admin/logout", { method: "POST", headers: writeHeaders })).status).toBe(204);
    expect((await app.request("http://worker.test/api/auth/admin/me", { headers: { cookie } })).status).toBe(401);
  });
});
