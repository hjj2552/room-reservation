import { pagesProjectNameFromEnv } from "./cloudflare-production-config.mjs";

const pagesProjectName = pagesProjectNameFromEnv();
const baseUrl = new URL(`https://${pagesProjectName}.pages.dev`);

async function request(path) {
  try {
    return await fetch(new URL(path, baseUrl), {
      method: "GET",
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

await expectJson("/api/public/settings", 200);
await expectJson("/api/public/rooms", 200);
const admin = await expectJson("/api/admin/rooms", 401);
if (admin?.code !== "ADMIN_UNAUTHORIZED") {
  throw new Error("Production admin protection contract is invalid.");
}

process.stdout.write("Production same-origin read-only smoke completed.\n");
