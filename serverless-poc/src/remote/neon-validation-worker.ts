import { Client, neon, neonConfig } from "@neondatabase/serverless";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

interface Env {
  APP_ENV: string;
  DATABASE_URL: string;
  PROBE_TOKEN: string;
}

type AppContext = Context<{ Bindings: Env }>;
const app = new Hono<{ Bindings: Env }>();
const encoder = new TextEncoder();
const SESSION_COOKIE = "P3-NEON-SESSION";
const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";

neonConfig.webSocketConstructor = WebSocket;

function token(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function sqlFor(context: AppContext) {
  return neon(context.env.DATABASE_URL);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

app.use("/api/p3-neon/*", async (context, next) => {
  if (context.env.APP_ENV !== "uat") return context.json({ code: "INVALID_ENVIRONMENT" }, 503);
  if (context.req.header("X-P3-Probe-Token") !== context.env.PROBE_TOKEN) {
    return context.json({ code: "UNAUTHORIZED" }, 401);
  }
  await next();
});

app.onError((error, context) => {
  return context.json({ code: "P3_VALIDATION_ERROR", errorClass: errorCode(error) ?? "UNCLASSIFIED" }, 500);
});

app.get("/api/p3-neon/query", async (context) => {
  const value = context.req.query("value") ?? "missing";
  const rows = await sqlFor(context)`SELECT ${value}::text AS value, current_database() AS database`;
  return context.json({ value: String(rows[0]?.value), databaseMatches: rows[0]?.database === "room_reservation_p3_primary_20260721" });
});

app.post("/api/p3-neon/echo", async (context) => {
  const input = await context.req.json<{ value: string }>();
  return context.json({ value: input.value }, 201);
});

app.get("/api/p3-neon/status/:status", (context) => {
  const status = Number(context.req.param("status"));
  return new Response(JSON.stringify({ code: `STATUS_${status}` }), {
    status,
    headers: { "content-type": "application/json" },
  });
});

app.get("/api/p3-neon/client-ip", (context) => {
  const cfIp = context.req.header("CF-Connecting-IP")?.trim();
  const forwarded = context.req.header("X-Forwarded-For")?.trim();
  const spoof = context.req.header("X-P3-Spoof-Value")?.trim();
  return context.json({
    cfConnectingIpPresent: Boolean(cfIp),
    forwardedForPresent: Boolean(forwarded),
    forwardedMatchesCf: Boolean(cfIp && forwarded && cfIp === forwarded),
    forwardedMatchesSpoof: Boolean(spoof && forwarded === spoof),
  });
});

app.post("/api/p3-neon/transaction/http/:mode", async (context) => {
  const mode = context.req.param("mode");
  const { marker } = await context.req.json<{ marker: string }>();
  const sql = sqlFor(context);
  let committed = false;
  let rolledBack = false;
  try {
    await sql.transaction([
      sql`INSERT INTO p3_neon_transaction_probe(marker, transport) VALUES (${`${marker}:1`}, 'http')`,
      sql`INSERT INTO p3_neon_transaction_probe(marker, transport) VALUES (${mode === "rollback" ? `${marker}:1` : `${marker}:2`}, 'http')`,
    ]);
    committed = true;
  } catch {
    rolledBack = true;
  }
  const rows = await sql`SELECT count(*)::int AS count FROM p3_neon_transaction_probe WHERE marker LIKE ${`${marker}:%`}`;
  return context.json({ committed, rolledBack, persisted: Number(rows[0]?.count ?? -1) });
});

app.post("/api/p3-neon/transaction/websocket/:mode", async (context) => {
  const mode = context.req.param("mode");
  const { marker } = await context.req.json<{ marker: string }>();
  const client = new Client(context.env.DATABASE_URL);
  let committed = false;
  let rolledBack = false;
  await client.connect();
  try {
    await client.query("BEGIN");
    const decision = await client.query<{ should_insert: boolean }>("SELECT $1::text = 'commit' AS should_insert", [mode]);
    if (decision.rows[0]?.should_insert) {
      await client.query("INSERT INTO p3_neon_transaction_probe(marker, transport) VALUES ($1, 'websocket')", [`${marker}:commit`]);
      await client.query("COMMIT");
      committed = true;
    } else {
      await client.query("INSERT INTO p3_neon_transaction_probe(marker, transport) VALUES ($1, 'websocket')", [`${marker}:rollback`]);
      throw new Error("INTENTIONAL_ROLLBACK");
    }
  } catch {
    if (!committed) {
      await client.query("ROLLBACK");
      rolledBack = true;
    }
  } finally {
    await client.end();
  }
  const rows = await sqlFor(context)`SELECT count(*)::int AS count FROM p3_neon_transaction_probe WHERE marker LIKE ${`${marker}:%`}`;
  return context.json({ committed, rolledBack, persisted: Number(rows[0]?.count ?? -1), connectionClosed: true });
});

app.post("/api/p3-neon/rooms", async (context) => {
  const { id, name } = await context.req.json<{ id: string; name: string }>();
  await sqlFor(context)`INSERT INTO p3_neon_rooms(id, name) VALUES (${id}, ${name})`;
  return context.json({ created: true }, 201);
});

app.delete("/api/p3-neon/rooms/:id", async (context) => {
  await sqlFor(context)`DELETE FROM p3_neon_rooms WHERE id = ${context.req.param("id")}`;
  return context.body(null, 204);
});

app.post("/api/p3-neon/reservations", async (context) => {
  const input = await context.req.json<{
    id: string;
    auditId: string;
    roomId: string;
    roomName: string;
    purpose: string;
    status: "REQUESTED" | "CONFIRMED" | "CANCELLED";
    startAt: string;
    endAt: string;
    failAudit?: boolean;
  }>();
  const sql = sqlFor(context);
  try {
    await sql`WITH inserted_reservation AS (
      INSERT INTO p3_neon_reservations(id, room_id, room_name_snapshot, purpose, status, start_at, end_at)
      VALUES (
        ${input.id}::uuid,
        ${input.roomId}::uuid,
        ${input.roomName}::text,
        ${input.purpose}::text,
        ${input.status}::text,
        ${input.startAt}::timestamptz,
        ${input.endAt}::timestamptz
      )
      RETURNING id
    )
    INSERT INTO p3_neon_reservation_events(id, reservation_id, event_type, room_name_snapshot, after_value)
    SELECT
      ${input.auditId}::uuid,
      inserted_reservation.id,
      ${input.failAudit ? "BROKEN" : "CREATED"}::text,
      ${input.roomName}::text,
      jsonb_build_object(
        'status', ${input.status}::text,
        'startAt', ${input.startAt}::text,
        'endAt', ${input.endAt}::text
      )
    FROM inserted_reservation`;
    return context.json({ created: true }, 201);
  } catch (error) {
    if (errorCode(error) === "23P01") return context.json({ code: "RESERVATION_CONFLICT" }, 409);
    if (input.failAudit) return context.json({ code: "AUDIT_WRITE_FAILED" }, 422);
    throw error;
  }
});

app.patch("/api/p3-neon/reservations/:id", async (context) => {
  const input = await context.req.json<{ auditId: string; status?: string; startAt?: string; endAt?: string }>();
  const client = new Client(context.env.DATABASE_URL);
  await client.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query<{
      status: string;
      start_at: Date;
      end_at: Date;
      room_name_snapshot: string;
    }>("SELECT status, start_at, end_at, room_name_snapshot FROM p3_neon_reservations WHERE id = $1 FOR UPDATE", [context.req.param("id")]);
    const row = before.rows[0];
    if (!row) throw new Error("NOT_FOUND");
    const nextStatus = input.status ?? row.status;
    const nextStart = input.startAt ?? row.start_at.toISOString();
    const nextEnd = input.endAt ?? row.end_at.toISOString();
    const eventType = input.startAt || input.endAt ? "TIME_CHANGED" : "STATUS_CHANGED";
    await client.query(
      "UPDATE p3_neon_reservations SET status = $2, start_at = $3, end_at = $4 WHERE id = $1",
      [context.req.param("id"), nextStatus, nextStart, nextEnd],
    );
    await client.query(
      `INSERT INTO p3_neon_reservation_events
         (id, reservation_id, event_type, room_name_snapshot, before_value, after_value)
       VALUES ($1, $2, $3, $4,
         jsonb_build_object('status', $5::text, 'startAt', $6::timestamptz, 'endAt', $7::timestamptz),
         jsonb_build_object('status', $8::text, 'startAt', $9::timestamptz, 'endAt', $10::timestamptz))`,
      [input.auditId, context.req.param("id"), eventType, row.room_name_snapshot, row.status, row.start_at, row.end_at, nextStatus, nextStart, nextEnd],
    );
    await client.query("COMMIT");
    return context.json({ updated: true, eventType });
  } catch (error) {
    await client.query("ROLLBACK");
    if (errorCode(error) === "23P01") return context.json({ code: "RESERVATION_CONFLICT" }, 409);
    throw error;
  } finally {
    await client.end();
  }
});

async function authenticatedSession(context: AppContext) {
  const sessionId = getCookie(context, SESSION_COOKIE);
  if (!sessionId) return { error: "UNAUTHORIZED" as const };
  const rows = await sqlFor(context)`SELECT session_id_hash, csrf_token_hash, expires_at
    FROM p3_neon_sessions WHERE session_id_hash = ${await digest(sessionId)}`;
  const row = rows[0];
  if (!row || new Date(String(row.expires_at)).getTime() <= Date.now()) return { error: "UNAUTHORIZED" as const };
  const csrfCookie = getCookie(context, CSRF_COOKIE);
  const csrfHeader = context.req.header(CSRF_HEADER);
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader || row.csrf_token_hash !== (await digest(csrfHeader))) {
    return { error: "INVALID_CSRF_TOKEN" as const };
  }
  return { sessionIdHash: String(row.session_id_hash) };
}

app.post("/api/p3-neon/session", async (context) => {
  const sessionId = token();
  const csrfToken = token();
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await sqlFor(context)`INSERT INTO p3_neon_sessions(session_id_hash, csrf_token_hash, expires_at)
    VALUES (${await digest(sessionId)}, ${await digest(csrfToken)}, ${expiresAt})`;
  setCookie(context, SESSION_COOKIE, sessionId, { expires: expiresAt, httpOnly: true, path: "/", sameSite: "Lax", secure: true });
  setCookie(context, CSRF_COOKIE, csrfToken, { expires: expiresAt, httpOnly: false, path: "/", sameSite: "Lax", secure: true });
  return context.json({ authenticated: true });
});

app.post("/api/p3-neon/protected", async (context) => {
  const session = await authenticatedSession(context);
  if ("error" in session) return context.json({ code: session.error }, session.error === "UNAUTHORIZED" ? 401 : 403);
  return context.json({ ok: true });
});

app.delete("/api/p3-neon/session", async (context) => {
  const session = await authenticatedSession(context);
  if ("error" in session) return context.json({ code: session.error }, session.error === "UNAUTHORIZED" ? 401 : 403);
  await sqlFor(context)`DELETE FROM p3_neon_sessions WHERE session_id_hash = ${session.sessionIdHash}`;
  deleteCookie(context, SESSION_COOKIE, { path: "/", secure: true, sameSite: "Lax" });
  deleteCookie(context, CSRF_COOKIE, { path: "/", secure: true, sameSite: "Lax" });
  return context.body(null, 204);
});

app.post("/api/p3-neon/password/hash", async (context) => {
  const { id, password, cost } = await context.req.json<{ id: string; password: string; cost: number }>();
  const started = Date.now();
  await sqlFor(context)`INSERT INTO p3_neon_password_probe(id, password_hash, cost)
    VALUES (${id}, crypt(${password}, gen_salt('bf', ${cost})), ${cost})`;
  return context.json({ stored: true, queryMs: Date.now() - started });
});

app.post("/api/p3-neon/password/verify", async (context) => {
  const { id, password } = await context.req.json<{ id: string; password: string }>();
  const started = Date.now();
  const rows = await sqlFor(context)`SELECT password_hash = crypt(${password}, password_hash) AS verified
    FROM p3_neon_password_probe WHERE id = ${id}`;
  return context.json({ verified: Boolean(rows[0]?.verified), queryMs: Date.now() - started });
});

app.post("/api/p3-neon/password/compare", async (context) => {
  const { first, second, cost } = await context.req.json<{ first: string; second: string; cost: number }>();
  const rows = await sqlFor(context)`WITH generated AS (SELECT crypt(${first}, gen_salt('bf', ${cost})) AS hash)
    SELECT hash = crypt(${second}, hash) AS matched FROM generated`;
  return context.json({ matched: Boolean(rows[0]?.matched) });
});

export default app;
