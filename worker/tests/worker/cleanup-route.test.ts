import { describe, expect, it } from "vitest";
import { createHttpApp } from "../../src/http/app";
import { parseRuntimeConfig } from "../../src/core/config";
import type { ProductService } from "../../src/services/product-service";
import type { SessionService } from "../../src/services/session-service";
import { allowAllRateLimiter, fixedClientIpProvider } from "../helpers/rate-limit";

function app(appEnv: "uat" | "prod", enabled: "true" | "false") {
  const products = {
    cleanupE2e: async () => ({ prefix: "testing-", dryRun: true }),
  } as unknown as ProductService;
  const sessions = {
    find: async () => ({
      sessionIdHash: "hash", csrfTokenHash: "csrf", adminUsername: "admin",
      expiresAt: new Date(Date.now() + 60_000),
    }),
  } as unknown as SessionService;
  return createHttpApp(parseRuntimeConfig({ APP_ENV: appEnv, E2E_CLEANUP_ENABLED: enabled }), {
    products,
    sessions,
    rateLimiter: allowAllRateLimiter,
    clientIpProvider: fixedClientIpProvider,
    adminUsername: "admin",
    adminPassword: "secret",
  });
}

describe("cleanup route registration", () => {
  it("registers only for non-prod with the explicit flag", async () => {
    const headers = { cookie: `ROOM-SESSION=${"A".repeat(43)}` };
    expect((await app("uat", "true").request("/api/admin/test-data/e2e/preview", { headers })).status).toBe(200);
    expect((await app("uat", "false").request("/api/admin/test-data/e2e/preview", { headers })).status).toBe(404);
    expect((await app("prod", "true").request("/api/admin/test-data/e2e/preview", { headers })).status).toBe(404);
  });
});
