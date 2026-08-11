import { productionOriginFromEnv } from "./cloudflare-production-config.mjs";

const baseUrl = new URL(productionOriginFromEnv());

async function request(path, init = {}) {
  try {
    return await fetch(new URL(path, baseUrl), {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Production same-origin smoke request failed.");
  }
}

async function expectJson(path, expectedStatus) {
  const response = await request(path);
  if (response.status !== expectedStatus) {
    throw new Error("Production same-origin smoke returned an unexpected status.");
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Production same-origin smoke returned an unexpected content type.");
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("Production same-origin smoke returned invalid JSON.");
  }
  const serialized = JSON.stringify(body);
  if (/(relation .* does not exist|column .* does not exist|worker_migrations|migration failed)/i.test(serialized)) {
    throw new Error("Production same-origin smoke detected a schema or migration error.");
  }
  return body;
}

function cookieHeader(response) {
  return response.headers.getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

async function authenticatedCleanupHeaders() {
  const username = process.env.SMOKE_ADMIN_USERNAME;
  const password = process.env.SMOKE_ADMIN_PASSWORD;
  if (!username && !password) return null;
  if (!username || !password) {
    throw new Error("Production cleanup route smoke credentials are incomplete.");
  }
  const csrfResponse = await request("/api/auth/csrf");
  if (csrfResponse.status !== 200) throw new Error("Production cleanup route smoke authentication failed.");
  const csrf = await csrfResponse.json();
  const cookie = cookieHeader(csrfResponse);
  const loginResponse = await request("/api/auth/admin/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      "X-XSRF-TOKEN": csrf.token,
    },
    body: JSON.stringify({ username, password }),
  });
  if (loginResponse.status !== 200) throw new Error("Production cleanup route smoke authentication failed.");
  return { cookie, "X-XSRF-TOKEN": csrf.token };
}

async function expectHtml(path) {
  const response = await request(path);
  if (response.status !== 200 || !(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
    throw new Error("Production Static Assets smoke returned an unexpected response.");
  }
}

await expectHtml("/");
await expectHtml("/timetable");
await expectJson("/api/public/settings", 200);
await expectJson("/api/public/rooms", 200);
const admin = await expectJson("/api/admin/rooms", 401);
if (admin?.code !== "ADMIN_UNAUTHORIZED") {
  throw new Error("Production admin protection contract is invalid.");
}
const cleanupHeaders = await authenticatedCleanupHeaders();
const cleanupPreview = await request("/api/admin/test-data/e2e/preview", { headers: cleanupHeaders ?? undefined });
const cleanupExecute = await request("/api/admin/test-data/e2e", {
  method: "DELETE",
  headers: cleanupHeaders ?? undefined,
});
if (cleanupHeaders) {
  if (cleanupPreview.status !== 404 || cleanupExecute.status !== 404) {
    throw new Error("Production cleanup route is unexpectedly exposed.");
  }
} else if (
  ![401, 404].includes(cleanupPreview.status)
  || ![401, 403, 404].includes(cleanupExecute.status)
) {
  throw new Error("Production cleanup route protection is invalid.");
}

process.stdout.write("Production same-origin read-only smoke completed.\n");
