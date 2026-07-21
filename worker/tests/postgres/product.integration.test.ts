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

async function resetProductData() {
  await database.query("DELETE FROM admin_sessions");
  await database.query("DELETE FROM reservation_histories");
  await database.query("DELETE FROM reservations");
  await database.query("DELETE FROM reservation_recurrences");
  await database.query("DELETE FROM tags");
  await database.query("DELETE FROM rooms WHERE system_reserved=false");
  await database.query(
    `UPDATE operation_settings SET organization_name='Room Reservation', public_notice=NULL,
      reservation_enabled=true, reservation_disabled_message=NULL,
      semester_start_date=(current_date - interval '1 day')::date,
      semester_end_date=(current_date + interval '180 days')::date,
      open_time='09:00', close_time='18:00', available_days_of_week='MON,TUE,WED,THU,FRI',
      min_reservation_minutes=30, max_reservation_minutes=240,
      admin_contact_email='admin@example.test', admin_contact_phone=NULL,
      completion_message=NULL, updated_by=NULL, version=0`,
  );
}

async function insertRoom(name: string) {
  const result = await database.query(
    "INSERT INTO rooms(name,capacity,enabled) VALUES($1,10,true) RETURNING id",
    [name],
  );
  return String(result.rows[0]?.id);
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
  deleted?: boolean;
}) {
  const date = futureWeekday(35, 10).slice(0, 10);
  const result = await database.query(
    `INSERT INTO reservation_recurrences(
       room_id,applicant_name,applicant_email,applicant_phone,purpose,start_date,end_date,
       days_of_week,start_time,end_time,conflict_policy,tag_id,created_by,created_at,deleted_at
     ) VALUES($1,$2,$3,'010-0000-0000',$4,$5,$5,'MON','10:00','11:00','FAIL_ALL',$6,'admin',$7,$8)
     RETURNING id`,
    [input.roomId, input.applicantName ?? "ordinary applicant", input.applicantEmail ?? "ordinary@example.test",
      input.purpose, date, input.tagId ?? null, input.createdAt ?? new Date().toISOString(), input.deleted ? new Date() : null],
  );
  return String(result.rows[0]?.id);
}

async function insertReservation(input: {
  roomId: string;
  purpose: string;
  applicantName?: string;
  applicantEmail?: string;
  recurrenceId?: string | null;
  hour?: number;
  status?: string;
  source?: string;
  createdAt?: string;
}) {
  const startAt = futureWeekday(55, input.hour ?? 10);
  const result = await database.query(
    `INSERT INTO reservations(
       room_id,recurrence_id,applicant_name,applicant_email,applicant_phone,purpose,
       start_at,end_at,status,source,created_by_actor_type,created_at
     ) VALUES($1,$2,$3,$4,'010-0000-0000',$5,$6,$7,$8,$9,'ADMIN',$10) RETURNING id`,
    [input.roomId, input.recurrenceId ?? null, input.applicantName ?? "ordinary applicant",
      input.applicantEmail ?? "ordinary@example.test", input.purpose, startAt, addHour(startAt),
      input.status ?? "CONFIRMED", input.source ?? "ADMIN_MANUAL", input.createdAt ?? new Date().toISOString()],
  );
  return String(result.rows[0]?.id);
}

async function authenticatedApp(environment: "uat" | "prod" = "uat") {
  const app = createHttpApp(parseRuntimeConfig({ APP_ENV: environment, E2E_CLEANUP_ENABLED: "false" }), {
    products, sessions, adminUsername: "admin", adminPassword: "admin1234",
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

describe("Spring-compatible recurrence search", () => {
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
      const result = await products.listRecurrences(new URL(`http://worker.test/api/admin/recurrences?keyword=${keyword}`));
      expect(result.totalItems).toBe(1);
      expect(result.items[0]?.id).toBe(expectedId);
    }
    const emailOnly = await products.listRecurrences(new URL("http://worker.test/api/admin/recurrences?keyword=emailneedle"));
    expect(emailOnly.totalItems).toBe(0);
  });

  it("keeps the same search set with filters, pagination and createdAt descending order", async () => {
    await resetProductData();
    const roomId = await insertRoom("ordinary-filter-room");
    const older = await insertRecurrence({ roomId, purpose: "FilterNeedle older", createdAt: "2026-01-01T00:00:00Z" });
    const newer = await insertRecurrence({ roomId, purpose: "FilterNeedle newer", createdAt: "2026-01-02T00:00:00Z" });
    await insertRecurrence({ roomId, purpose: "FilterNeedle cancelled", createdAt: "2026-01-03T00:00:00Z", deleted: true });
    const date = futureWeekday(35, 10).slice(0, 10);
    const url = new URL(`http://worker.test/api/admin/recurrences?keyword=filterneedle&status=ACTIVE&roomId=${roomId}&fromDate=${date}&toDate=${date}&page=0&size=1`);
    const first = await products.listRecurrences(url);
    expect(first).toMatchObject({ page: 0, size: 1, totalItems: 2, totalPages: 2 });
    expect(first.items[0]?.id).toBe(newer);
    url.searchParams.set("page", "1");
    expect((await products.listRecurrences(url)).items[0]?.id).toBe(older);
  });
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
  it("exports the exact BOM CSV contract, all filtered rows, escaping and Seoul timestamps", async () => {
    await resetProductData();
    const roomId = await insertRoom("ordinary-csv-room");
    const firstId = await insertReservation({
      roomId, purpose: "testing-csv, \"quoted\"\nline", applicantName: "CsvNeedle one", hour: 10,
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
    expect(csv).toContain(`"testing-csv, ""quoted""\nline"`);
    expect(csv).toContain(firstId);
    expect(csv).toContain(secondId);
    expect(csv.indexOf(firstId)).toBeLessThan(csv.indexOf(secondId));
    expect(csv).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    expect(csv).not.toContain("ordinary-not-exported");
  });

  it("applies page defaults, max clamp and validation errors", async () => {
    await resetProductData();
    await database.query("INSERT INTO tags(name,color) SELECT 'ordinary-page-'||lpad(n::text,3,'0'),'#123456' FROM generate_series(1,105) n");
    expect(await products.listTags(new URL("http://worker.test/api/admin/tags"))).toMatchObject({ page: 0, size: 20, totalItems: 105, totalPages: 6 });
    expect((await products.listTags(new URL("http://worker.test/api/admin/tags?size=100000"))).items).toHaveLength(100);
    await expect(products.listTags(new URL("http://worker.test/api/admin/tags?page=-1"))).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(products.listTags(new URL("http://worker.test/api/admin/tags?size=0"))).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(products.listTags(new URL("http://worker.test/api/admin/tags?page=abc"))).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("keeps settings updates atomic, detects version conflicts and rejects time precision", async () => {
    await resetProductData();
    const before = await products.getSettings();
    const payload = { ...before, organizationName: "Updated atomically", slotMinutes: 5 };
    await expect(products.updateSettings({ ...payload, minReservationMinutes: 35, maxReservationMinutes: 30 }, "admin"))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(products.updateSettings({ ...payload, openTime: "09:00:01" }, "admin"))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(products.updateSettings({ ...payload, openTime: "09:00:00.1" }, "admin"))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(products.updateSettings({ ...payload, openTime: "09:15" }, "admin"))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(products.updateSettings({ ...payload, semesterStartDate: "2026-02-30" }, "admin"))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(await products.getSettings()).toEqual(before);
    const updated = await products.updateSettings(payload, "admin");
    expect(updated).toMatchObject({ organizationName: "Updated atomically", version: 1 });
    await expect(products.updateSettings(payload, "admin")).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
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
    await expect(products.createRecurrence(body, "admin")).rejects.toMatchObject({ status: 409, code: "RECURRENCE_CONFLICT" });
    expect((await database.query("SELECT 1 FROM reservation_recurrences WHERE purpose=$1", [body.purpose])).rows).toHaveLength(0);
    expect((await database.query("SELECT 1 FROM reservations WHERE purpose=$1", [body.purpose])).rows).toHaveLength(0);
    expect((await database.query("SELECT 1 FROM reservation_histories WHERE reservation_purpose=$1", [body.purpose])).rows).toHaveLength(0);
  });
});

describe("input boundaries, cookies and bounded session cleanup", () => {
  it("rejects malformed direct API values as validation 4xx instead of 500", async () => {
    await resetProductData();
    const roomId = await insertRoom("ordinary-validation-room");
    const { app, cookie, writeHeaders } = await authenticatedApp();
    const requests = [
      app.request("http://worker.test/api/public/rooms/not-a-uuid"),
      app.request(`http://worker.test/api/public/rooms/${roomId}/weekly-reservations?weekStart=2026-02-30`),
      app.request("http://worker.test/api/public/availability?roomId=bad&startAt=2026-01-01T10:00:00%2B09:00&endAt=2026-01-01T11:00:00%2B09:00"),
      app.request("http://worker.test/api/admin/reservations?roomId=bad", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/reservations?status=BOGUS", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/reservations?source=BOGUS", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/reservations?excludeCancelled=maybe", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/reservations?from=2026-02-30T10:00:00%2B09:00", { headers: { cookie } }),
      app.request("http://worker.test/api/admin/recurrences?status=BOGUS", { headers: { cookie } }),
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
