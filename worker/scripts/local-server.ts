import { createServer } from "node:http";
import { parseRuntimeConfig } from "../src/core/config";
import { createHttpApp } from "../src/http/app";
import { ProductService } from "../src/services/product-service";
import { SessionService } from "../src/services/session-service";
import { PgDatabase } from "../tests/postgres/pg-database";
import type { ClientIpProvider, RateLimiter } from "../src/core/rate-limit";

const databaseUrl = process.env.DATABASE_URL;
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!databaseUrl || !adminUsername || !adminPassword) {
  throw new Error("DATABASE_URL, ADMIN_USERNAME, and ADMIN_PASSWORD are required");
}

const config = parseRuntimeConfig({
  APP_ENV: process.env.APP_ENV ?? "local",
  E2E_CLEANUP_ENABLED: process.env.E2E_CLEANUP_ENABLED ?? "false",
});
const database = new PgDatabase(databaseUrl);
const allowAllRateLimiter: RateLimiter = {
  check: async () => ({ allowed: true }),
};
const localClientIpProvider: ClientIpProvider = {
  getClientIp: () => "127.0.0.1",
};
const app = createHttpApp(config, {
  products: new ProductService(database, () => new Date()),
  sessions: new SessionService(database, () => new Date()),
  rateLimiter: allowAllRateLimiter,
  clientIpProvider: localClientIpProvider,
  adminUsername,
  adminPassword,
});
const port = Number(process.env.PORT ?? "8080");

const server = createServer(async (request, response) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }
    const url = `http://${request.headers.host ?? `127.0.0.1:${port}`}${request.url ?? "/"}`;
    const init: RequestInit = { method: request.method ?? "GET", headers };
    if (request.method !== "GET" && request.method !== "HEAD" && body) init.body = body as BodyInit;
    const workerResponse = await app.fetch(new Request(url, init));
    response.statusCode = workerResponse.status;
    workerResponse.headers.forEach((value, name) => {
      if (name !== "set-cookie") response.setHeader(name, value);
    });
    const cookies = workerResponse.headers.getSetCookie();
    if (cookies.length > 0) response.setHeader("set-cookie", cookies);
    response.end(Buffer.from(await workerResponse.arrayBuffer()));
  } catch (error) {
    console.error(error);
    response.statusCode = 500;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ code: "INTERNAL_SERVER_ERROR", message: "Unexpected server error." }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local Worker HTTP adapter listening on http://127.0.0.1:${port}`);
});

async function shutdown() {
  server.close();
  await database.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(130)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
