import { afterAll, afterEach, beforeEach, expect, it } from "vitest";
import { SessionService } from "../../src/services/session-service";
import { ProductService } from "../../src/services/product-service";
import { createHttpApp } from "../../src/http/app";
import { parseRuntimeConfig } from "../../src/core/config";
import type { Database } from "../../src/infra/database";
import { PgDatabase } from "./pg-database";
import { allowAllRateLimiter, fixedClientIpResolver } from "../helpers/rate-limit";

const database = new PgDatabase(process.env.DATABASE_URL!);
const username = `testing-session-${crypto.randomUUID()}`;
const password = "testing-session-password";
const ownedHashes: string[] = [];
let now: Date;
let sessions: SessionService;
beforeEach(() => {
  now = new Date();
  sessions = new SessionService(database, () => now);
});
afterEach(async () => {
  await database.query("DELETE FROM admin_sessions WHERE admin_username=$1 OR session_id_hash=ANY($2::text[])", [username, ownedHashes]);
  ownedHashes.length = 0;
});
afterAll(() => database.close());

function appWith(service = sessions) {
  return createHttpApp(parseRuntimeConfig({ APP_ENV: "test", E2E_CLEANUP_ENABLED: "false" }), {
    products: new ProductService(database, () => now), sessions: service,
    rateLimiter: allowAllRateLimiter, resolveClientIp: fixedClientIpResolver,
    adminUsername: username, adminPassword: password,
  });
}

function cookies(response: Response) {
  const header = response.headers.get("set-cookie") || "";
  const sessionId = /ROOM-SESSION=([^;,]+)/.exec(header)?.[1];
  const csrfToken = /XSRF-TOKEN=([^;,]+)/.exec(header)?.[1];
  if (!sessionId || !csrfToken) throw new Error("Expected session cookies");
  return { sessionId, csrfToken };
}
function headers(tokens: { sessionId: string; csrfToken: string }) {
  return { "content-type": "application/json", "X-XSRF-TOKEN": tokens.csrfToken,
    cookie: `ROOM-SESSION=${tokens.sessionId}; XSRF-TOKEN=${tokens.csrfToken}` };
}
async function anonymous() {
  const issued = await sessions.issue();
  ownedHashes.push(issued.record.sessionIdHash);
  return issued;
}
async function login(app: ReturnType<typeof appWith>, tokens: Parameters<typeof headers>[0], loginPassword = password) {
  return app.request("/api/auth/admin/login", {
    method: "POST", headers: headers(tokens), body: JSON.stringify({ username, password: loginPassword }),
  });
}

async function prepareLogin(app = appWith(), stale?: Parameters<typeof headers>[0]) {
  const response = await app.request('/api/auth/admin/login-session', stale ? { headers: headers(stale) } : {});
  expect(response.status).toBe(200);
  expect(response.headers.has('set-cookie')).toBe(false);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const tokens = await response.json() as { sessionId: string; csrfToken: string };
  const record = await sessions.find(tokens.sessionId);
  expect(record !== null && record.adminUsername === null).toBe(true);
  ownedHashes.push(record!.sessionIdHash);
  return tokens;
}

async function recoveryLogin(app: ReturnType<typeof appWith>, prepared: Parameters<typeof headers>[0],
  stale: Parameters<typeof headers>[0], loginPassword = password) {
  return app.request('/api/auth/admin/login', {
    method: 'POST',
    headers: { ...headers(stale), 'X-Login-Session': prepared.sessionId, 'X-XSRF-TOKEN': prepared.csrfToken },
    body: JSON.stringify({ username, password: loginPassword }),
  });
}

it('recovers lost login cookies without reviving the old session or bypassing credentials and CSRF', async () => {
  const app = appWith();
  const stale = await anonymous();
  expect((await login(app, stale)).status).toBe(200); // Discard the successful Set-Cookie.
  expect((await login(app, stale)).status).toBe(403);
  const prepared = await prepareLogin(app, stale);
  const invalidCsrf = await recoveryLogin(app, { ...prepared, csrfToken: stale.csrfToken }, stale);
  expect(invalidCsrf.status).toBe(403);
  expect(invalidCsrf.headers.has('set-cookie')).toBe(false);
  const rejected = await recoveryLogin(app, prepared, stale, 'testing-wrong-password');
  expect(rejected.status).toBe(401);
  expect(rejected.headers.has('set-cookie')).toBe(false);
  expect((await sessions.find(prepared.sessionId))?.adminUsername).toBeNull();
  const expiry = (await sessions.find(prepared.sessionId))!.expiresAt;
  now = new Date(now.getTime() + 60_000);
  const recovered = await recoveryLogin(app, prepared, stale);
  expect(recovered.status).toBe(200);
  const next = cookies(recovered);
  expect((await sessions.find(next.sessionId))?.expiresAt).toEqual(expiry);
  expect(await sessions.find(stale.sessionId)).toBeNull();
  expect(await sessions.find(prepared.sessionId)).toBeNull();
  expect((await app.request('/api/auth/admin/me', { headers: headers(stale) })).status).toBe(401);
  expect((await app.request('/api/auth/admin/me', { headers: headers(next) })).status).toBe(200);
  expect((await recoveryLogin(app, next, stale)).status).toBe(403); // No authenticated bearer-session channel.
  expect((await app.request('/api/auth/admin/me', {
    headers: { ...headers(stale), 'X-Login-Session': next.sessionId },
  })).status).toBe(401);
  const duplicate = await recoveryLogin(app, prepared, next);
  expect(duplicate.status).toBe(403);
  expect(duplicate.headers.has('set-cookie')).toBe(false);
  expect((await app.request('/api/auth/admin/logout', { method: 'POST', headers: headers(next) })).status).toBe(204);
});

it('a delayed duplicate preparation neither sets cookies nor consumes a normal login session', async () => {
  const old = await anonymous();
  let release!: () => void;
  let reached!: () => void;
  const paused = new Promise<void>(resolve => { reached = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  let issuedCount = 0;
  class PausedIssueService extends SessionService {
    override async issue() {
      const issued = await super.issue();
      ownedHashes.push(issued.record.sessionIdHash);
      if (++issuedCount === 2) reached();
      await resume;
      return issued;
    }
  }
  const delayedApp = appWith(new PausedIssueService(database, () => now));
  const pending = [prepareLogin(delayedApp, old), prepareLogin(delayedApp, old)];
  try {
    await paused;
    const normal = cookies(await login(appWith(), old));
    release();
    const prepared = await Promise.all(pending);
    expect(prepared[0]!.sessionId !== prepared[1]!.sessionId).toBe(true);
    // Even a recovery submitted after normal login consumes only its own anonymous session.
    const recovered = await recoveryLogin(appWith(), prepared[0]!, normal);
    expect(recovered.status).toBe(200);
    for (const tokens of [normal, cookies(recovered)]) {
      expect((await appWith().request('/api/auth/admin/me', { headers: headers(tokens) })).status).toBe(200);
    }
  } finally {
    release();
    await Promise.allSettled(pending);
  }
});

it("rotates both tokens, revokes old access and preserves the original expiry and cookie policy", async () => {
  const app = appWith();
  const old = await anonymous();
  now = new Date(now.getTime() + 60 * 60 * 1000);
  const response = await login(app, old);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: username, username, role: "OPERATOR" });
  const next = cookies(response);
  // Compare booleans so assertion failures never print credentials or tokens.
  expect(next.sessionId !== old.sessionId && next.csrfToken !== old.csrfToken).toBe(true);
  expect(await sessions.find(old.sessionId)).toBeNull();
  const record = await sessions.find(next.sessionId);
  expect(record?.adminUsername).toBe(username);
  expect(record?.expiresAt).toEqual(old.record.expiresAt);
  expect(response.headers.get("set-cookie")?.match(/Expires=[^;]+/g)).toEqual([
    `Expires=${old.record.expiresAt.toUTCString()}`, `Expires=${old.record.expiresAt.toUTCString()}`,
  ]);
  expect((await app.request("/api/auth/admin/me", { headers: headers(old) })).status).toBe(401);
  expect((await app.request("/api/auth/admin/logout", { method: "POST", headers: headers(old) })).status).toBe(403);
  expect((await app.request("/api/auth/admin/me", { headers: headers(next) })).status).toBe(200);
  const staleCsrf = await app.request("/api/auth/csrf", { headers: headers(old) });
  expect(staleCsrf.status).toBe(403);
  expect(staleCsrf.headers.has("set-cookie")).toBe(false);
  const mixed = { ...next, csrfToken: old.csrfToken };
  expect((await app.request("/api/auth/admin/logout", { method: "POST", headers: headers(mixed) })).status).toBe(403);
  now = new Date(old.record.expiresAt.getTime() - 1);
  expect((await app.request("/api/auth/admin/me", { headers: headers(next) })).status).toBe(200);
  now = old.record.expiresAt;
  expect((await app.request("/api/auth/admin/me", { headers: headers(next) })).status).toBe(401);
  expect((await login(app, next)).status).toBe(403);
});

it("keeps the anonymous session on failed credentials and supports fresh writes, logout and relogin", async () => {
  const app = appWith();
  const old = await anonymous();
  const failed = await login(app, old, "testing-wrong-password");
  expect(failed.status).toBe(401);
  expect(failed.headers.has("set-cookie")).toBe(false);
  expect((await sessions.find(old.sessionId))?.adminUsername).toBeNull();
  expect((await database.query("SELECT 1 FROM admin_sessions WHERE admin_username=$1", [username])).rows).toHaveLength(0);
  const loggedIn = await login(app, old);
  const next = cookies(loggedIn);
  expect((await app.request("/api/auth/admin/logout", { method: "POST", headers: headers(next) })).status).toBe(204);
  expect(await sessions.find(next.sessionId)).toBeNull();
  const bootstrap = await app.request("/api/auth/csrf");
  const fresh = cookies(bootstrap);
  const record = await sessions.find(fresh.sessionId);
  if (record) ownedHashes.push(record.sessionIdHash);
  expect((await login(app, fresh)).status).toBe(200);
});

async function waitForLocks(count: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await database.query(`SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE datname=current_database() AND state='active' AND wait_event_type='Lock'
      AND query LIKE 'SELECT expires_at FROM admin_sessions%FOR UPDATE'`);
    if (Number(result.rows[0]?.count) >= count) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Session lock waiters did not arrive");
}

it.each([false, true])("serializes concurrent logins and rechecks expiry after the lock (expire=%s)", async expire => {
  const app = appWith();
  const old = await anonymous();
  const blocker = await database.pool.connect();
  const pending: Promise<Response>[] = [];
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM admin_sessions WHERE session_id_hash=$1 FOR UPDATE", [old.record.sessionIdHash]);
    pending.push(login(app, old), login(app, old));
    await waitForLocks(2);
    if (expire) now = old.record.expiresAt;
    await blocker.query("COMMIT");
    const results = await Promise.all(pending);
    expect(results.map(result => result.status).sort()).toEqual(expire ? [403, 403] : [200, 403]);
    for (const response of results.filter(result => result.status === 403)) {
      expect(response.headers.has("set-cookie")).toBe(false);
    }
    expect((await database.query("SELECT 1 FROM admin_sessions WHERE admin_username=$1", [username])).rows)
      .toHaveLength(expire ? 0 : 1);
    if (!expire) expect(await sessions.authenticate(old.record, username)).toBeNull();
  } finally {
    await blocker.query("ROLLBACK");
    await Promise.allSettled(pending);
    blocker.release();
  }
});

it.each([false, true])('atomically consumes recovery sessions and rechecks expiry (expire=%s)', async expire => {
  const app = appWith();
  const stale = await anonymous();
  await login(app, stale);
  const prepared = await prepareLogin(app, stale);
  const record = (await sessions.find(prepared.sessionId))!;
  const blocker = await database.pool.connect();
  const pending: Promise<Response>[] = [];
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT 1 FROM admin_sessions WHERE session_id_hash=$1 FOR UPDATE', [record.sessionIdHash]);
    pending.push(recoveryLogin(app, prepared, stale), recoveryLogin(app, prepared, stale));
    await waitForLocks(2);
    if (expire) now = record.expiresAt;
    await blocker.query('COMMIT');
    const results = await Promise.all(pending);
    expect(results.map(result => result.status).sort()).toEqual(expire ? [403, 403] : [200, 403]);
    for (const response of results) {
      if (response.status === 403) expect(response.headers.has('set-cookie')).toBe(false);
      else expect((await app.request('/api/auth/admin/me', { headers: headers(cookies(response)) })).status).toBe(200);
    }
  } finally {
    await blocker.query('ROLLBACK');
    await Promise.allSettled(pending);
    blocker.release();
  }
});

it.each([false, true])("rolls back deletion and insertion on a real PostgreSQL error (after insert=%s)", async afterInsert => {
  const old = await anonymous();
  const failingDatabase: Database = {
    query: (sql, values) => database.query(sql, values),
    transaction: work => database.transaction(client => work({
      query: async <Row extends Record<string, unknown>>(sql: string, values?: unknown[]) => {
        if (sql.includes("INSERT INTO admin_sessions") && !afterInsert) await client.query("SELECT 1/0");
        const result = await client.query<Row>(sql, values);
        if (sql.includes("INSERT INTO admin_sessions") && afterInsert) await client.query("SELECT 1/0");
        return result;
      },
    })),
  };
  const app = appWith(new SessionService(failingDatabase, () => now));
  const response = await login(app, old);
  expect(response.status).toBe(500);
  expect(response.headers.has("set-cookie")).toBe(false);
  expect((await sessions.find(old.sessionId))?.adminUsername).toBeNull();
  expect((await sessions.find(old.sessionId))?.expiresAt).toEqual(old.record.expiresAt);
  expect((await database.query("SELECT 1 FROM admin_sessions WHERE admin_username=$1", [username])).rows).toHaveLength(0);
  expect((await login(appWith(), old)).status).toBe(200);
});

it.each(["/api/auth/csrf", "/api/auth/admin/logout"])("a delayed old %s response does not overwrite new cookies", async path => {
  const old = await anonymous();
  const initial = cookies(await login(appWith(), old));
  let release!: () => void;
  let reached!: () => void;
  const paused = new Promise<void>(resolve => { reached = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  class PausedSessionService extends SessionService {
    override async find(id: string | undefined) {
      const record = await super.find(id);
      reached();
      await resume;
      return record;
    }
  }
  const delayed = appWith(new PausedSessionService(database, () => now)).request(path, {
    method: path.endsWith("logout") ? "POST" : "GET", headers: headers(initial),
  });
  try {
    await paused;
    const rotated = await login(appWith(), initial);
    expect(rotated.status).toBe(200);
    release();
    const response = await delayed;
    expect(response.status).toBe(path.endsWith("logout") ? 204 : 200);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect((await appWith().request("/api/auth/admin/me", { headers: headers(cookies(rotated)) })).status).toBe(200);
  } finally {
    release();
    await delayed;
  }
});
