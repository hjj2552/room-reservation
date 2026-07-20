import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL tests");

const pool = new pg.Pool({ connectionString: databaseUrl, max: 12 });
let roomId: string;

beforeAll(async () => {
  const room = await pool.query<{ id: string }>(
    "INSERT INTO p3_poc_rooms(name) VALUES ($1) RETURNING id",
    [`testing-room-p3-${randomUUID()}`],
  );
  roomId = room.rows[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

describe("disposable PostgreSQL proof", () => {
  it("commits successful work and rolls back failed work", async () => {
    const committed = `commit-${randomUUID()}`;
    const rolledBack = `rollback-${randomUUID()}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO p3_poc_transaction_probe(marker) VALUES ($1)", [committed]);
      await client.query("COMMIT");

      await client.query("BEGIN");
      await client.query("INSERT INTO p3_poc_transaction_probe(marker) VALUES ($1)", [rolledBack]);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const rows = await pool.query<{ marker: string }>(
      "SELECT marker FROM p3_poc_transaction_probe WHERE marker = ANY($1::text[]) ORDER BY marker",
      [[committed, rolledBack]],
    );
    expect(rows.rows.map(({ marker }) => marker)).toEqual([committed]);
  });

  it("atomically rejects all but one concurrent overlapping reservation", async () => {
    const insert = () =>
      pool.query(
        `INSERT INTO p3_poc_reservations(room_id, purpose, status, start_at, end_at)
         VALUES ($1, $2, 'REQUESTED', $3, $4)
         RETURNING id`,
        [roomId, `testing-reservation-${randomUUID()}`, "2026-07-21T01:00:00Z", "2026-07-21T02:00:00Z"],
      );

    const results = await Promise.allSettled(Array.from({ length: 8 }, () => insert()));
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(7);
    for (const result of rejected) {
      expect((result.reason as { code?: string }).code).toBe("23P01");
    }
  });

  it("allows a cancelled reservation to overlap", async () => {
    await expect(
      pool.query(
        `INSERT INTO p3_poc_reservations(room_id, purpose, status, start_at, end_at)
         VALUES ($1, $2, 'CANCELLED', $3, $4)`,
        [roomId, `testing-reservation-${randomUUID()}`, "2026-07-21T01:15:00Z", "2026-07-21T01:45:00Z"],
      ),
    ).resolves.toBeDefined();
  });

  it.each([
    ["public-read", 120],
    ["public-write", 24],
  ] as const)("enforces the shared atomic %s limit at %i", async (scope, limit) => {
    const key = `sha256:${randomUUID()}`;
    const windowStart = "2026-07-20T00:00:00Z";
    const consume = () =>
      pool.query<{ allowed: boolean; request_count: number }>(
        `WITH attempted AS (
           INSERT INTO p3_poc_rate_limit_buckets(scope, bucket_key_hash, window_started_at, request_count)
           VALUES ($1, $2, $3, 1)
           ON CONFLICT (scope, bucket_key_hash, window_started_at)
           DO UPDATE SET request_count = p3_poc_rate_limit_buckets.request_count + 1
           WHERE p3_poc_rate_limit_buckets.request_count < $4
           RETURNING request_count
         )
         SELECT
           EXISTS (SELECT 1 FROM attempted) AS allowed,
           COALESCE(
             (SELECT request_count FROM attempted),
             (SELECT request_count FROM p3_poc_rate_limit_buckets
              WHERE scope = $1 AND bucket_key_hash = $2 AND window_started_at = $3)
           ) AS request_count`,
        [scope, key, windowStart, limit],
      );

    const results = await Promise.all(Array.from({ length: limit + 12 }, () => consume()));
    expect(results.filter((result) => result.rows[0]!.allowed)).toHaveLength(limit);
    expect(results.filter((result) => !result.rows[0]!.allowed)).toHaveLength(12);
    expect(Math.max(...results.map((result) => result.rows[0]!.request_count))).toBe(limit);
  });
});
