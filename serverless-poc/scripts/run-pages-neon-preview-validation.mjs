import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");

function parseVars(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pages = parseVars(await readFile(path.join(projectRoot, ".dev.vars.p3-pages-runtime"), "utf8"));
const worker = parseVars(await readFile(path.join(projectRoot, ".dev.vars.p3-neon-runtime"), "utf8"));

async function call(pathname, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${pages.P3_PAGES_ORIGIN}${pathname}`, {
    method,
    headers: {
      "X-P3-Probe-Token": worker.P3_NEON_PROBE_TOKEN,
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
  return { response, text, json };
}

const queryValue = `pages-query-${randomUUID()}&shape=?`;
const query = await call(`/api/p3-neon/query?value=${encodeURIComponent(queryValue)}`);
assert(query.response.status === 200 && query.json.value === queryValue, "query string was not preserved");

const echoValue = `pages-body-${randomUUID()}`;
const echo = await call("/api/p3-neon/echo", { method: "POST", body: { value: echoValue } });
assert(echo.response.status === 201 && echo.json.value === echoValue, "method or body was not preserved");

const teapot = await call("/api/p3-neon/status/418");
assert(teapot.response.status === 418 && teapot.json.code === "STATUS_418", "backend status or body was not preserved");

const login = await call("/api/p3-neon/session", { method: "POST" });
assert(login.response.status === 200, "session creation failed through Pages");
const setCookies = login.response.headers.getSetCookie();
assert(setCookies.length === 2, "multiple Set-Cookie headers were not preserved");
const sessionCookie = setCookies.find((value) => value.startsWith("P3-NEON-SESSION="));
const csrfCookie = setCookies.find((value) => value.startsWith("XSRF-TOKEN="));
assert(sessionCookie && csrfCookie, "session or CSRF cookie was missing");
assert(/;\s*HttpOnly/i.test(sessionCookie), "session cookie was not HttpOnly");
assert(!/;\s*HttpOnly/i.test(csrfCookie), "CSRF cookie must remain readable by the frontend");
for (const cookie of setCookies) {
  assert(/;\s*Secure/i.test(cookie) && /;\s*SameSite=Lax/i.test(cookie) && /;\s*Path=\//i.test(cookie), "cookie flags changed");
}

const cookieHeader = setCookies.map((value) => value.split(";", 1)[0]).join("; ");
const csrfToken = csrfCookie.split(";", 1)[0].slice("XSRF-TOKEN=".length);
const valid = await call("/api/p3-neon/protected", {
  method: "POST",
  headers: { cookie: cookieHeader, "X-XSRF-TOKEN": csrfToken },
});
const missing = await call("/api/p3-neon/protected", { method: "POST", headers: { cookie: cookieHeader } });
const mismatch = await call("/api/p3-neon/protected", {
  method: "POST",
  headers: { cookie: cookieHeader, "X-XSRF-TOKEN": `${csrfToken}:mismatch` },
});
assert(valid.response.status === 200 && valid.json.ok === true, "same-origin session and CSRF request failed");
assert(missing.response.status === 403 && mismatch.response.status === 403, "missing or mismatched CSRF was not rejected");

const ip = await call("/api/p3-neon/client-ip", {
  headers: { "X-Forwarded-For": "203.0.113.250", "X-P3-Spoof-Value": "203.0.113.250" },
});
assert(ip.response.status === 200, "client IP observation failed");
assert(ip.json.cfConnectingIpPresent === true && ip.json.forwardedForPresent === true, "trusted IP headers were absent");
assert(ip.json.forwardedMatchesSpoof === false, "spoofed forwarded IP reached the Worker");

const logout = await call("/api/p3-neon/session", {
  method: "DELETE",
  headers: { cookie: cookieHeader, "X-XSRF-TOKEN": csrfToken },
});
assert(logout.response.status === 204, "logout failed");
const afterLogout = await call("/api/p3-neon/protected", {
  method: "POST",
  headers: { cookie: cookieHeader, "X-XSRF-TOKEN": csrfToken },
});
assert(afterLogout.response.status === 401, "deleted session remained usable");

const idleStartedAt = new Date().toISOString();
await writeFile(path.join(projectRoot, ".dev.vars.p3-neon-idle"), `P3_NEON_IDLE_STARTED_AT=${idleStartedAt}\n`, {
  encoding: "utf8",
  mode: 0o600,
});

process.stdout.write(`${JSON.stringify({
  queryStringPreserved: true,
  methodAndBodyPreserved: true,
  backendStatusAndBodyPreserved: true,
  multipleSetCookiePreserved: true,
  cookieFlagsPreserved: true,
  sessionAndCsrfFlow: true,
  missingCsrfStatus: missing.response.status,
  mismatchedCsrfStatus: mismatch.response.status,
  logoutStatus: logout.response.status,
  afterLogoutStatus: afterLogout.response.status,
  cfConnectingIpPresent: ip.json.cfConnectingIpPresent,
  forwardedForPresent: ip.json.forwardedForPresent,
  forwardedMatchesCf: ip.json.forwardedMatchesCf,
  spoofedForwardedIpRejected: true,
  idleTimerStarted: true,
})}\n`);
