import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProductService } from "../../src/services/product-service";
import { SessionService } from "../../src/services/session-service";
import { createHttpApp } from "../../src/http/app";
import { parseRuntimeConfig } from "../../src/core/config";
import { AppError } from "../../src/core/errors";
import { PgDatabase } from "./pg-database";

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

beforeAll(async () => {
  await database.query("DELETE FROM admin_sessions");
  await database.query("DELETE FROM reservation_histories");
  await database.query("DELETE FROM reservations");
  await database.query("DELETE FROM reservation_recurrences");
  await database.query("DELETE FROM tags");
  await database.query("DELETE FROM rooms WHERE system_reserved=false");
  await database.query(
    `UPDATE operation_settings SET reservation_enabled=true,
      semester_start_date=(current_date - interval '1 day')::date,
      semester_end_date=(current_date + interval '180 days')::date,
      available_days_of_week='MON,TUE,WED,THU,FRI', version=0`,
  );
});

afterAll(async () => {
  await database.close();
});

describe("baseline V1", () => {
  it("starts without Spring tables/slot_minutes and has required system data", async () => {
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
    const four = await products.createPublicReservation(publicPayload(roomId, "Aa1!", "testing-password-four", 10));
    const sixtyFourPassword = `A${"b".repeat(61)}1!`;
    const sixtyFour = await products.createPublicReservation(publicPayload(roomId, sixtyFourPassword, "testing-password-sixty-four", 11));
    for (const [id, plaintext] of [[four.id, "Aa1!"], [sixtyFour.id, sixtyFourPassword]]) {
      const stored = await database.query("SELECT cancel_password_hash FROM reservations WHERE id=$1", [id]);
      const hash = String(stored.rows[0]?.cancel_password_hash);
      expect(hash).toMatch(/^\$2[aby]?\$12\$/);
      expect(hash).not.toContain(plaintext);
    }
    await expect(products.verifyPublicReservationForEdit(four.id, { cancelPassword: "Aa1!" })).resolves.toMatchObject({ id: four.id });
    await expect(products.verifyPublicReservationForEdit(four.id, { cancelPassword: "aa1!" })).rejects.toMatchObject({ code: "PUBLIC_RESERVATION_PASSWORD_MISMATCH" });
  });

  it.each([
    ["3 characters", "A1!"],
    ["65 characters", "A".repeat(65)],
    ["Korean", "비밀번호1!"],
    ["space", "pass word"],
    ["emoji", "pass😀"],
    ["full-width", "Ｐａｓｓ"],
  ])("rejects %s before hashing", async (_label, password) => {
    await expect(products.createPublicReservation(publicPayload(roomId, password, `testing-invalid-${_label}`, 12)))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("allows exactly one winner for competing requests", async () => {
    const payload = publicPayload(roomId, "Race1!", "testing-race", 14);
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => products.createPublicReservation({
      ...payload,
      applicantEmail: `testing-race-${index}@example.test`,
      purpose: `testing-race-${index}`,
    })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(failures).toHaveLength(7);
    expect(failures.every((result) => result.reason instanceof AppError && result.reason.code === "TIME_SLOT_CONFLICT")).toBe(true);
  });
});

describe("HTTP session, CSRF, admin contracts and cleanup", () => {
  it("supports the existing cookie/header flow and guarded product routes", async () => {
    const app = createHttpApp(parseRuntimeConfig({ APP_ENV: "uat", E2E_CLEANUP_ENABLED: "true" }), {
      products, sessions, adminUsername: "admin", adminPassword: "admin1234",
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
