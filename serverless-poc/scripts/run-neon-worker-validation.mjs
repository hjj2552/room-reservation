import { randomUUID } from "node:crypto";
import fs from "node:fs";
import pg from "pg";

function parseVars(file) {
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

const secret = parseVars(".dev.vars.p3-neon");
const runtime = parseVars(".dev.vars.p3-neon-runtime");
const origin = runtime.P3_NEON_WORKER_ORIGIN;
const probeToken = runtime.P3_NEON_PROBE_TOKEN;
const client = new pg.Client({ connectionString: secret.NEON_P3_PRIMARY_DIRECT_URL });
await client.connect();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const started = performance.now();
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      "X-P3-Probe-Token": probeToken,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, json, wallMs: performance.now() - started, headers: response.headers };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)].toFixed(3));
}

function stats(values) {
  return {
    samples: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Number(Math.max(...values).toFixed(3)),
  };
}

async function createRoom(name) {
  const id = randomUUID();
  const response = await call("/api/p3-neon/rooms", { method: "POST", body: { id, name } });
  assert(response.status === 201, "room creation failed");
  return { id, name };
}

async function createReservation(room, overrides = {}) {
  const input = {
    id: randomUUID(),
    auditId: randomUUID(),
    roomId: room.id,
    roomName: room.name,
    purpose: `testing-reservation-${randomUUID()}`,
    status: "REQUESTED",
    startAt: "2035-01-01T01:00:00Z",
    endAt: "2035-01-01T02:00:00Z",
    ...overrides,
  };
  return { input, response: await call("/api/p3-neon/reservations", { method: "POST", body: input }) };
}

const summary = { http: {}, transactions: {}, concurrency: [], conflicts: {}, audit: {}, password: {} };

try {
  const injection = "probe'); DROP TABLE p3_neon_rooms; --";
  const query = await call(`/api/p3-neon/query?value=${encodeURIComponent(injection)}`);
  const roomTable = await client.query("SELECT to_regclass('public.p3_neon_rooms') IS NOT NULL AS exists");
  assert(query.status === 200 && query.json.value === injection && roomTable.rows[0].exists, "HTTP parameter binding failed");
  summary.http = { parameterizedQuery: true, databaseMatches: query.json.databaseMatches === true };

  for (const transport of ["http", "websocket"]) {
    for (const mode of ["commit", "rollback"]) {
      const result = await call(`/api/p3-neon/transaction/${transport}/${mode}`, {
        method: "POST",
        body: { marker: `testing-${transport}-${mode}-${randomUUID()}` },
      });
      assert(result.status === 200, `${transport} ${mode} request failed`);
      if (mode === "commit") assert(result.json.committed === true && result.json.persisted > 0, `${transport} commit failed`);
      else assert(result.json.rolledBack === true && result.json.persisted === 0, `${transport} rollback failed`);
      summary.transactions[`${transport}-${mode}`] = result.json;
    }
  }

  for (let round = 1; round <= 10; round += 1) {
    const room = await createRoom(`testing-room-concurrency-${round}-${randomUUID()}`);
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => createReservation(room)),
    );
    const success = attempts.filter(({ response }) => response.status === 201).length;
    const conflicts = attempts.filter(({ response }) => response.status === 409 && response.json.code === "RESERVATION_CONFLICT").length;
    const counts = await client.query(
      `SELECT
         (SELECT count(*)::int FROM p3_neon_reservations WHERE room_id = $1 AND status IN ('REQUESTED','CONFIRMED')) AS active,
         (SELECT count(*)::int FROM p3_neon_reservation_events e JOIN p3_neon_reservations r ON r.id=e.reservation_id WHERE r.room_id=$1) AS events`,
      [room.id],
    );
    const row = counts.rows[0];
    const statuses = attempts.reduce((counts, { response }) => {
      const key = `${response.status}:${response.json.code ?? "NONE"}:${response.json.errorClass ?? "NONE"}`;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
    assert(
      success === 1 && conflicts === 7 && row.active === 1 && row.events === 1,
      `concurrency round ${round} failed: ${JSON.stringify({ statuses, active: row.active, events: row.events })}`,
    );
    summary.concurrency.push({ round, success, conflicts, active: row.active, events: row.events });
  }

  const room = await createRoom(`testing-room-cases-${randomUUID()}`);
  const otherRoom = await createRoom(`testing-room-other-${randomUUID()}`);
  const base = await createReservation(room, { status: "REQUESTED" });
  assert(base.response.status === 201, "base reservation failed");
  const same = await createReservation(room, { status: "CONFIRMED" });
  const partial = await createReservation(room, { startAt: "2035-01-01T01:30:00Z", endAt: "2035-01-01T02:30:00Z" });
  const boundary = await createReservation(room, { status: "CONFIRMED", startAt: "2035-01-01T02:00:00Z", endAt: "2035-01-01T03:00:00Z" });
  const other = await createReservation(otherRoom, { status: "CONFIRMED" });
  const cancelled = await createReservation(room, { status: "CANCELLED", startAt: "2035-01-01T01:15:00Z", endAt: "2035-01-01T01:45:00Z" });
  assert(same.response.status === 409 && partial.response.status === 409, "insert conflicts were not rejected");
  assert(boundary.response.status === 201 && other.response.status === 201 && cancelled.response.status === 201, "non-conflicts were rejected");

  const later = await createReservation(room, { startAt: "2035-01-01T04:00:00Z", endAt: "2035-01-01T05:00:00Z" });
  assert(later.response.status === 201, "later reservation failed");
  const timeConflict = await call(`/api/p3-neon/reservations/${later.input.id}`, {
    method: "PATCH",
    body: { auditId: randomUUID(), startAt: "2035-01-01T01:30:00Z", endAt: "2035-01-01T02:30:00Z" },
  });
  const activationConflict = await call(`/api/p3-neon/reservations/${cancelled.input.id}`, {
    method: "PATCH",
    body: { auditId: randomUUID(), status: "REQUESTED" },
  });
  assert(timeConflict.status === 409 && activationConflict.status === 409, "update conflicts were not rejected");

  const statusChange = await call(`/api/p3-neon/reservations/${boundary.input.id}`, {
    method: "PATCH",
    body: { auditId: randomUUID(), status: "REQUESTED" },
  });
  const timeChange = await call(`/api/p3-neon/reservations/${boundary.input.id}`, {
    method: "PATCH",
    body: { auditId: randomUUID(), startAt: "2035-01-01T03:00:00Z", endAt: "2035-01-01T04:00:00Z" },
  });
  assert(statusChange.status === 200 && statusChange.json.eventType === "STATUS_CHANGED", "status event classification failed");
  assert(timeChange.status === 200 && timeChange.json.eventType === "TIME_CHANGED", "time event classification failed");

  const failedAudit = await createReservation(room, {
    startAt: "2035-01-01T06:00:00Z",
    endAt: "2035-01-01T07:00:00Z",
    failAudit: true,
  });
  const failedCounts = await client.query(
    `SELECT
       (SELECT count(*)::int FROM p3_neon_reservations WHERE id=$1) AS reservations,
       (SELECT count(*)::int FROM p3_neon_reservation_events WHERE reservation_id=$1) AS events`,
    [failedAudit.input.id],
  );
  assert(failedAudit.response.status === 422 && failedCounts.rows[0].reservations === 0 && failedCounts.rows[0].events === 0, "audit failure rollback failed");

  const failedUpdateAudit = await client.query(
    `SELECT
       (SELECT count(*)::int FROM p3_neon_reservation_events WHERE reservation_id=$1) AS later_events,
       (SELECT count(*)::int FROM p3_neon_reservation_events WHERE reservation_id=$2) AS cancelled_events,
       (SELECT status FROM p3_neon_reservations WHERE id=$2) AS cancelled_status`,
    [later.input.id, cancelled.input.id],
  );
  assert(failedUpdateAudit.rows[0].later_events === 1 && failedUpdateAudit.rows[0].cancelled_events === 1 && failedUpdateAudit.rows[0].cancelled_status === "CANCELLED", "failed update left audit or state changes");

  const deletedRoom = await createRoom(`testing-room-deleted-${randomUUID()}`);
  const deletedReservation = await createReservation(deletedRoom, { status: "CANCELLED", startAt: "2035-01-01T08:00:00Z", endAt: "2035-01-01T09:00:00Z" });
  await call(`/api/p3-neon/rooms/${deletedRoom.id}`, { method: "DELETE" });
  const snapshot = await client.query("SELECT room_id, room_name_snapshot FROM p3_neon_reservations WHERE id=$1", [deletedReservation.input.id]);
  assert(snapshot.rows[0].room_id === null && snapshot.rows[0].room_name_snapshot === deletedRoom.name, "deleted room snapshot failed");

  summary.conflicts = {
    sameSpaceSameTime: same.response.status,
    partialOverlap: partial.response.status,
    touchingBoundary: boundary.response.status,
    differentRoom: other.response.status,
    cancelledOverlap: cancelled.response.status,
    timeUpdateConflict: timeConflict.status,
    activationConflict: activationConflict.status,
  };
  summary.audit = {
    failedCreateReservationRows: failedCounts.rows[0].reservations,
    failedCreateEventRows: failedCounts.rows[0].events,
    failedTimeUpdateEventCount: failedUpdateAudit.rows[0].later_events,
    failedActivationEventCount: failedUpdateAudit.rows[0].cancelled_events,
    statusAndTimeDistinguished: true,
    deletedRoomNamePreserved: true,
  };

  const characterCases = [
    ["english", "AbcdEfgh"],
    ["numeric", "12345678"],
    ["special", "!@#$%^&*()_+"],
    ["korean", "한글비밀번호"],
    ["minimum-four", "abcd"],
    ["sql-injection-shape", "' OR 1=1 --"],
  ];
  const characterResults = [];
  for (const [name, password] of characterCases) {
    const id = randomUUID();
    const hashed = await call("/api/p3-neon/password/hash", { method: "POST", body: { id, password, cost: 10 } });
    const valid = await call("/api/p3-neon/password/verify", { method: "POST", body: { id, password } });
    const invalid = await call("/api/p3-neon/password/verify", { method: "POST", body: { id, password: `${password}:wrong` } });
    characterResults.push({ name, hashStatus: hashed.status, valid: valid.json.verified === true, invalidRejected: invalid.json.verified === false });
  }
  assert(characterResults.every((item) => item.hashStatus === 200 && item.valid && item.invalidRejected), "bcrypt character cases failed");

  const samePassword = `same-password-${randomUUID()}`;
  const saltIds = [randomUUID(), randomUUID()];
  for (const id of saltIds) await call("/api/p3-neon/password/hash", { method: "POST", body: { id, password: samePassword, cost: 10 } });
  const hashes = await client.query("SELECT password_hash FROM p3_neon_password_probe WHERE id=ANY($1::uuid[]) ORDER BY id", [saltIds]);
  assert(hashes.rows.length === 2 && hashes.rows[0].password_hash !== hashes.rows[1].password_hash, "bcrypt salts were not unique");
  const plaintext = await client.query(
    `SELECT
       count(*) FILTER (WHERE password_hash = ANY($1::text[]))::int AS plaintext_matches,
       bool_and(password_hash LIKE '$2%') AS hashes_only
     FROM p3_neon_password_probe`,
    [characterCases.map(([, password]) => password).concat([samePassword])],
  );

  const edgeCases = [
    ["ascii-72", "a".repeat(72)],
    ["ascii-73", "a".repeat(73)],
    ["ascii-100", "a".repeat(100)],
    ["korean-72-bytes", "한".repeat(24)],
    ["korean-75-bytes", "한".repeat(25)],
  ];
  const edgeResults = [];
  for (const [name, password] of edgeCases) {
    const id = randomUUID();
    const hashed = await call("/api/p3-neon/password/hash", { method: "POST", body: { id, password, cost: 10 } });
    edgeResults.push({ name, utf8Bytes: new TextEncoder().encode(password).length, status: hashed.status });
  }
  const prefix72 = "p".repeat(72);
  const beyondA = await call("/api/p3-neon/password/compare", { method: "POST", body: { first: `${prefix72}A`, second: `${prefix72}B`, cost: 10 } });

  const costMetrics = {};
  for (const cost of [10, 11, 12]) {
    const metrics = { hashWorker: [], hashQuery: [], validWorker: [], validQuery: [], invalidWorker: [], invalidQuery: [] };
    for (let sample = 0; sample < 5; sample += 1) {
      const id = randomUUID();
      const password = `Cost-${cost}-${randomUUID()}-한글!`;
      const hashed = await call("/api/p3-neon/password/hash", { method: "POST", body: { id, password, cost } });
      const valid = await call("/api/p3-neon/password/verify", { method: "POST", body: { id, password } });
      const invalid = await call("/api/p3-neon/password/verify", { method: "POST", body: { id, password: `${password}:wrong` } });
      assert(hashed.status === 200 && valid.json.verified === true && invalid.json.verified === false, `bcrypt cost ${cost} failed`);
      metrics.hashWorker.push(hashed.wallMs);
      metrics.hashQuery.push(Number(hashed.json.queryMs));
      metrics.validWorker.push(valid.wallMs);
      metrics.validQuery.push(Number(valid.json.queryMs));
      metrics.invalidWorker.push(invalid.wallMs);
      metrics.invalidQuery.push(Number(invalid.json.queryMs));
    }
    costMetrics[cost] = Object.fromEntries(Object.entries(metrics).map(([name, values]) => [name, stats(values)]));
  }

  summary.password = {
    characterResults,
    distinctSaltHashes: true,
    plaintextMatches: plaintext.rows[0].plaintext_matches,
    hashesOnly: plaintext.rows[0].hashes_only,
    edgeResults,
    passwordsDifferingAfter72: { status: beyondA.status, matched: beyondA.json.matched ?? null },
    costMetrics,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} finally {
  await client.end();
}
