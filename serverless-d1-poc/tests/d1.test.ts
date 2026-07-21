import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createRoom, ensureMigrations } from "./helpers";

async function insertReservation(
  roomId: string,
  status: "REQUESTED" | "CONFIRMED" | "CANCELLED",
  startAtUtcMs: number,
  endAtUtcMs: number,
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO p3_d1_reservations
       (id, room_id, status, start_at_utc_ms, end_at_utc_ms, purpose, created_at_utc_ms)
     VALUES (?, ?, ?, ?, ?, 'testing-reservation-trigger', ?)`,
  )
    .bind(id, roomId, status, startAtUtcMs, endAtUtcMs, Date.now())
    .run();
  return id;
}

describe("D1 schema, trigger, and batch behavior", () => {
  beforeAll(ensureMigrations);

  it("runs the migration on local D1", async () => {
    const migration = await env.DB.prepare(
      "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1",
    ).first<{ name: string }>();
    expect(migration?.name).toBe("0001_p3_d1_poc.sql");
  });

  it("rejects overlapping insert, overlapping update, and conflicting activation", async () => {
    const roomId = await createRoom();
    const ten = Date.parse("2031-01-01T10:00:00+09:00");
    const eleven = Date.parse("2031-01-01T11:00:00+09:00");
    const first = await insertReservation(roomId, "REQUESTED", ten, eleven);

    await expect(insertReservation(roomId, "CONFIRMED", ten + 30 * 60_000, eleven + 30 * 60_000)).rejects.toThrow(
      /reservation_conflict/,
    );

    const later = await insertReservation(roomId, "CONFIRMED", eleven, eleven + 60 * 60_000);
    await expect(
      env.DB.prepare("UPDATE p3_d1_reservations SET start_at_utc_ms = ? WHERE id = ?")
        .bind(ten + 30 * 60_000, later)
        .run(),
    ).rejects.toThrow(/reservation_conflict/);

    const cancelled = await insertReservation(roomId, "CANCELLED", ten, eleven);
    await expect(
      env.DB.prepare("UPDATE p3_d1_reservations SET status = 'REQUESTED' WHERE id = ?")
        .bind(cancelled)
        .run(),
    ).rejects.toThrow(/reservation_conflict/);

    await expect(
      env.DB.prepare("UPDATE p3_d1_reservations SET purpose = purpose WHERE id = ?").bind(first).run(),
    ).resolves.toBeDefined();
  });

  it("allows overlap with CANCELLED and does not conflict with the row itself", async () => {
    const roomId = await createRoom();
    const start = Date.parse("2032-01-01T10:00:00+09:00");
    const end = start + 60 * 60_000;
    const active = await insertReservation(roomId, "REQUESTED", start, end);
    await expect(insertReservation(roomId, "CANCELLED", start, end)).resolves.toBeTypeOf("string");
    await expect(
      env.DB.prepare("UPDATE p3_d1_reservations SET end_at_utc_ms = ? WHERE id = ?")
        .bind(end, active)
        .run(),
    ).resolves.toBeDefined();
  });

  it("commits a successful batch and rolls back all statements when a later statement fails", async () => {
    const roomId = await createRoom();
    const committedId = crypto.randomUUID();
    const failedId = crypto.randomUUID();
    const start = Date.parse("2033-01-01T10:00:00+09:00");
    const insert = (id: string) =>
      env.DB.prepare(
        `INSERT INTO p3_d1_reservations
           (id, room_id, status, start_at_utc_ms, end_at_utc_ms, purpose, created_at_utc_ms)
         VALUES (?, ?, 'REQUESTED', ?, ?, 'testing-reservation-batch', ?)`,
      ).bind(id, roomId, start, start + 30 * 60_000, Date.now());

    await env.DB.batch([
      insert(committedId),
      env.DB.prepare(
        "INSERT INTO p3_d1_reservation_events (id, reservation_id, event_type, created_at_utc_ms) VALUES (?, ?, 'CREATED', ?)",
      ).bind(crypto.randomUUID(), committedId, Date.now()),
    ]);
    expect(
      (await env.DB.prepare("SELECT COUNT(*) AS count FROM p3_d1_reservation_events WHERE reservation_id = ?")
        .bind(committedId)
        .first<{ count: number }>())?.count,
    ).toBe(1);

    await expect(
      env.DB.batch([
        insert(failedId),
        env.DB.prepare(
          "INSERT INTO p3_d1_reservation_events (id, reservation_id, event_type, created_at_utc_ms) VALUES (?, ?, 'CREATED', ?)",
        ).bind(crypto.randomUUID(), "missing-reservation", Date.now()),
      ]),
    ).rejects.toThrow();
    expect(
      (await env.DB.prepare("SELECT COUNT(*) AS count FROM p3_d1_reservations WHERE id = ?")
        .bind(failedId)
        .first<{ count: number }>())?.count,
    ).toBe(0);
  });
});
