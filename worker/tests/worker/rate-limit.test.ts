import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRuntimeConfig } from "../../src/core/config";
import type { RateLimiter } from "../../src/core/rate-limit";
import { createHttpApp } from "../../src/http/app";
import { CloudflareRateLimiter } from "../../src/infra/cloudflare-rate-limit";
import { TrustedProxyClientIpProvider } from "../../src/infra/trusted-proxy-client-ip";
import type { ProductService } from "../../src/services/product-service";
import type { SessionRecord, SessionService } from "../../src/services/session-service";
import {
  DeterministicRateLimiter,
  headerClientIpProvider,
} from "../helpers/rate-limit";

const config = parseRuntimeConfig({
  APP_ENV: "test",
  E2E_CLEANUP_ENABLED: "false",
});

function testApp(options: {
  limiter?: RateLimiter;
  adminSession?: boolean;
  productCalls?: { reads: number; writes: number };
  sessionCalls?: { finds: number };
} = {}) {
  const productCalls = options.productCalls ?? { reads: 0, writes: 0 };
  const sessionCalls = options.sessionCalls ?? { finds: 0 };
  const products = {
    getPublicSettings: async () => {
      productCalls.reads += 1;
      return { reservationEnabled: true };
    },
    createPublicReservation: async () => {
      productCalls.writes += 1;
      return { id: "00000000-0000-4000-8000-000000000001" };
    },
  } as unknown as ProductService;
  const adminSession: SessionRecord = {
    sessionIdHash: "session-hash",
    csrfTokenHash: "csrf-hash",
    adminUsername: "admin",
    expiresAt: new Date(Date.now() + 60_000),
  };
  const sessions = {
    find: async () => {
      sessionCalls.finds += 1;
      return options.adminSession ? adminSession : null;
    },
    validateCsrf: async () => false,
  } as unknown as SessionService;
  const app = createHttpApp(config, {
    products,
    sessions,
    rateLimiter: options.limiter ?? new DeterministicRateLimiter(),
    clientIpProvider: headerClientIpProvider,
    adminUsername: "admin",
    adminPassword: "secret",
  });
  return { app, productCalls, sessionCalls };
}

function requestHeaders(ip = "203.0.113.10", cookie?: string): HeadersInit {
  return cookie
    ? { "x-test-client-ip": ip, cookie }
    : { "x-test-client-ip": ip };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public API rate-limit contract", () => {
  it("allows GET 120 and rejects 121 for the same IP without a session lookup", async () => {
    const { app, productCalls, sessionCalls } = testApp();
    for (let index = 0; index < 120; index += 1) {
      const response = await app.request("/api/public/settings", {
        headers: requestHeaders(),
      });
      expect(response.status).toBe(200);
    }

    const response = await app.request("/api/public/settings", {
      headers: requestHeaders(),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please retry later.",
      details: { retryAfterSeconds: 60 },
      fieldErrors: [],
      path: "/api/public/settings",
    });
    expect(response.headers.has("X-RateLimit-Remaining")).toBe(false);
    expect(productCalls.reads).toBe(120);
    expect(sessionCalls.finds).toBe(0);
  });

  it("allows 24 non-GET limiter checks and rejects 25 before CSRF, product, Neon, or bcrypt", async () => {
    const { app, productCalls, sessionCalls } = testApp();
    for (let index = 0; index < 24; index += 1) {
      const response = await app.request("/api/public/reservations", {
        method: "POST",
        headers: requestHeaders(),
      });
      expect(response.status).toBe(403);
    }

    const response = await app.request("/api/public/reservations", {
      method: "POST",
      headers: requestHeaders(),
    });
    expect(response.status).toBe(429);
    expect(productCalls.writes).toBe(0);
    expect(sessionCalls.finds).toBe(0);
  });

  it("keeps read/write counters and client IP counters separate", async () => {
    const { app } = testApp();
    for (let index = 0; index < 120; index += 1) {
      expect((await app.request("/api/public/settings", {
        headers: requestHeaders("203.0.113.11"),
      })).status).toBe(200);
    }
    expect((await app.request("/api/public/settings", {
      headers: requestHeaders("203.0.113.12"),
    })).status).toBe(200);
    expect((await app.request("/api/public/reservations", {
      method: "POST",
      headers: requestHeaders("203.0.113.11"),
    })).status).toBe(403);
  });

  it("bypasses every limiter for an authenticated administrator", async () => {
    const limiter: RateLimiter = {
      check: async () => {
        throw new Error("admin requests must bypass the limiter");
      },
    };
    const { app } = testApp({ limiter, adminSession: true });
    for (let index = 0; index < 130; index += 1) {
      expect((await app.request("/api/public/settings", {
        headers: requestHeaders("203.0.113.13", "ROOM-SESSION=admin-session"),
      })).status).toBe(200);
    }
  });

  it("limits unauthenticated admin APIs and excludes health", async () => {
    const { app } = testApp();
    for (let index = 0; index < 120; index += 1) {
      expect((await app.request("/api/admin/settings", {
        headers: requestHeaders("203.0.113.14"),
      })).status).toBe(401);
    }
    expect((await app.request("/api/admin/settings", {
      headers: requestHeaders("203.0.113.14"),
    })).status).toBe(429);
    expect((await app.request("/health")).status).toBe(200);
  });

  it("fails closed without a trusted IP or when a binding fails and never logs the IP", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const productCalls = { reads: 0, writes: 0 };
    const { app } = testApp({
      productCalls,
      limiter: { check: async () => { throw new Error("binding unavailable"); } },
    });

    const missingIp = await app.request("/api/public/settings");
    expect(missingIp.status).toBe(503);
    const bindingFailure = await app.request("/api/public/settings", {
      headers: requestHeaders("198.51.100.77"),
    });
    expect(bindingFailure.status).toBe(503);
    expect(await bindingFailure.json()).toMatchObject({
      code: "RATE_LIMIT_UNAVAILABLE",
      path: "/api/public/settings",
    });
    expect(productCalls.reads).toBe(0);
    expect(error.mock.calls.flat().join(" ")).not.toContain("198.51.100.77");
  });
});

describe("Cloudflare rate-limit and trusted-IP adapters", () => {
  it("selects exactly the read or write binding", async () => {
    const read = { limit: vi.fn(async () => ({ success: true })) };
    const write = { limit: vi.fn(async () => ({ success: false })) };
    const limiter = new CloudflareRateLimiter(read, write);

    await expect(limiter.check({ policy: "READ", actorKey: "read-actor" }))
      .resolves.toEqual({ allowed: true });
    await expect(limiter.check({ policy: "WRITE", actorKey: "write-actor" }))
      .resolves.toEqual({ allowed: false });
    expect(read.limit).toHaveBeenCalledWith({ key: "read-actor" });
    expect(write.limit).toHaveBeenCalledWith({ key: "write-actor" });
  });

  it("accepts only a valid Pages-owned internal IP header", () => {
    const provider = new TrustedProxyClientIpProvider();
    expect(provider.getClientIp(new Request("https://worker.test", {
      headers: {
        "X-Room-Reservation-Client-IP": "203.0.113.42",
        "CF-Connecting-IP": "198.51.100.1",
        "X-Forwarded-For": "198.51.100.2",
      },
    }))).toBe("203.0.113.42");
    expect(provider.getClientIp(new Request("https://worker.test", {
      headers: { "X-Room-Reservation-Client-IP": "not-an-ip" },
    }))).toBeNull();
    expect(provider.getClientIp(new Request("https://worker.test", {
      headers: { "CF-Connecting-IP": "203.0.113.42" },
    }))).toBeNull();
  });
});
