import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRuntimeConfig } from "../../src/core/config";
import type { RateLimiter, RateLimitPolicy } from "../../src/core/rate-limit";
import { createOpaqueToken, isValidOpaqueToken } from "../../src/core/security";
import { createHttpApp } from "../../src/http/app";
import { CloudflareRateLimiter } from "../../src/infra/cloudflare-rate-limit";
import type { Database } from "../../src/infra/database";
import { TrustedProxyClientIpProvider } from "../../src/infra/trusted-proxy-client-ip";
import { ProductService } from "../../src/services/product-service";
import { SessionService, type SessionRecord } from "../../src/services/session-service";
import {
  DeterministicRateLimiter,
  headerClientIpProvider,
} from "../helpers/rate-limit";

const config = parseRuntimeConfig({
  APP_ENV: "test",
  E2E_CLEANUP_ENABLED: "false",
});
const VALID_SESSION = "A".repeat(43);

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

  it("applies ingress while authenticated administrators bypass READ/WRITE", async () => {
    const policies: RateLimitPolicy[] = [];
    const limiter: RateLimiter = {
      check: async ({ policy }) => {
        policies.push(policy);
        if (policy !== "INGRESS") throw new Error("admin requests must bypass READ/WRITE");
        return { allowed: true };
      },
    };
    const { app } = testApp({ limiter, adminSession: true });
    for (let index = 0; index < 130; index += 1) {
      expect((await app.request("/api/public/settings", {
        headers: requestHeaders("203.0.113.13", `ROOM-SESSION=${VALID_SESSION}`),
      })).status).toBe(200);
    }
    expect(policies).toEqual(Array.from({ length: 130 }, () => "INGRESS"));
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
    const sessionCalls = { finds: 0 };
    const { app } = testApp({
      productCalls,
      sessionCalls,
      limiter: { check: async () => { throw new Error("binding unavailable"); } },
    });

    const missingIp = await app.request("/api/public/settings");
    expect(missingIp.status).toBe(503);
    const bindingFailure = await app.request("/api/public/settings", {
      headers: requestHeaders("198.51.100.77", `ROOM-SESSION=${VALID_SESSION}`),
    });
    expect(bindingFailure.status).toBe(503);
    expect(await bindingFailure.json()).toMatchObject({
      code: "RATE_LIMIT_UNAVAILABLE",
      path: "/api/public/settings",
    });
    expect(productCalls.reads).toBe(0);
    expect(sessionCalls.finds).toBe(0);
    const log = error.mock.calls.flat().join(" ");
    expect(log).toContain("\"policy\":\"INGRESS\"");
    expect(log).toContain("\"environment\":\"test\"");
    expect(log).not.toContain("198.51.100.77");
    expect(log).not.toContain(VALID_SESSION);
  });

  it("allows ingress 600 times, keeps READ independent, and rejects 601 before session or product work", async () => {
    const productCalls = { reads: 0, writes: 0 };
    const sessionCalls = { finds: 0 };
    const { app } = testApp({
      adminSession: true,
      productCalls,
      sessionCalls,
    });
    const headers = requestHeaders("203.0.113.20", `ROOM-SESSION=${VALID_SESSION}`);

    for (let index = 0; index < 120; index += 1) {
      expect((await app.request("/api/public/settings", {
        headers: requestHeaders("203.0.113.20"),
      })).status).toBe(200);
    }
    for (let index = 0; index < 480; index += 1) {
      expect((await app.request("/api/public/settings", { headers })).status).toBe(200);
    }

    const rejected = await app.request("/api/public/settings", { headers });
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("Retry-After")).toBe("60");
    expect(await rejected.json()).toEqual({
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please retry later.",
      details: { retryAfterSeconds: 60 },
      fieldErrors: [],
      path: "/api/public/settings",
    });
    expect(sessionCalls.finds).toBe(480);
    expect(productCalls.reads).toBe(600);

    expect((await app.request("/api/public/settings", {
      headers: requestHeaders("203.0.113.21", `ROOM-SESSION=${VALID_SESSION}`),
    })).status).toBe(200);
    expect(sessionCalls.finds).toBe(481);
  });

  it("rejects ingress before session, ProductService, Neon, or password database work", async () => {
    const productCalls = { reads: 0, writes: 0 };
    const sessionCalls = { finds: 0 };
    const { app } = testApp({
      productCalls,
      sessionCalls,
      limiter: {
        check: async ({ policy }) => ({ allowed: policy !== "INGRESS" }),
      },
    });

    const response = await app.request("/api/public/settings", {
      headers: requestHeaders("203.0.113.22", `ROOM-SESSION=${VALID_SESSION}`),
    });
    expect(response.status).toBe(429);
    expect(sessionCalls.finds).toBe(0);
    expect(productCalls).toEqual({ reads: 0, writes: 0 });
  });

  it("rejects ingress before the real session, Neon, ProductService, and password crypt path", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const database = {
      query,
      transaction: vi.fn(async () => {
        throw new Error("must not open a transaction");
      }),
    } as unknown as Database;
    const products = new ProductService(database, () => new Date());
    const cancel = vi.spyOn(products, "cancelPublicReservation");
    const sessions = new SessionService(database, () => new Date());
    const app = createHttpApp(config, {
      products,
      sessions,
      rateLimiter: { check: async () => ({ allowed: false }) },
      clientIpProvider: headerClientIpProvider,
      adminUsername: "admin",
      adminPassword: "secret",
    });

    const response = await app.request(
      "/api/public/reservations/00000000-0000-4000-8000-000000000001/cancel",
      {
        method: "POST",
        headers: {
          ...requestHeaders("203.0.113.24", `ROOM-SESSION=${VALID_SESSION}`),
          "content-type": "application/json",
          "X-XSRF-TOKEN": VALID_SESSION,
        },
        body: JSON.stringify({ password: "Password!123" }),
      },
    );

    expect(response.status).toBe(429);
    expect(query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("ignores malformed session cookies without a database lookup", async () => {
    const sessionCalls = { finds: 0 };
    const { app } = testApp({ sessionCalls });

    for (const value of [
      "short",
      "A".repeat(42),
      "A".repeat(44),
      `${"A".repeat(42)}=`,
      `${"A".repeat(42)}!`,
    ]) {
      const response = await app.request("/api/public/settings", {
        headers: requestHeaders("203.0.113.23", `ROOM-SESSION=${value}`),
      });
      expect(response.status).toBe(200);
    }
    expect(sessionCalls.finds).toBe(0);

    expect((await app.request("/api/public/settings", {
      headers: requestHeaders("203.0.113.23", `ROOM-SESSION=${VALID_SESSION}`),
    })).status).toBe(200);
    expect(sessionCalls.finds).toBe(1);
  });

  it("does not invoke ingress for health", async () => {
    const { app } = testApp({
      limiter: { check: async () => { throw new Error("must not be called"); } },
    });
    expect((await app.request("/health")).status).toBe(200);
  });
});

describe("Cloudflare rate-limit and trusted-IP adapters", () => {
  it("selects exactly the ingress, read, or write binding", async () => {
    const ingress = { limit: vi.fn(async () => ({ success: true })) };
    const read = { limit: vi.fn(async () => ({ success: true })) };
    const write = { limit: vi.fn(async () => ({ success: false })) };
    const limiter = new CloudflareRateLimiter(ingress, read, write);

    await expect(limiter.check({ policy: "INGRESS", actorKey: "ingress-actor" }))
      .resolves.toEqual({ allowed: true });
    await expect(limiter.check({ policy: "READ", actorKey: "read-actor" }))
      .resolves.toEqual({ allowed: true });
    await expect(limiter.check({ policy: "WRITE", actorKey: "write-actor" }))
      .resolves.toEqual({ allowed: false });
    expect(ingress.limit).toHaveBeenCalledWith({ key: "ingress-actor" });
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

describe("opaque session token format", () => {
  it("shares the 32-byte base64url issuance and validation contract", () => {
    const issued = createOpaqueToken();
    expect(issued).toHaveLength(43);
    expect(issued).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued).not.toContain("=");
    expect(isValidOpaqueToken(issued)).toBe(true);
    expect(isValidOpaqueToken(VALID_SESSION)).toBe(true);
    expect(isValidOpaqueToken(`${VALID_SESSION}=`)).toBe(false);
    expect(isValidOpaqueToken("한".repeat(43))).toBe(false);
  });

  it("keeps malformed tokens out of the session database service", async () => {
    const query = vi.fn();
    const sessions = new SessionService({
      query,
      transaction: async () => {
        throw new Error("not used");
      },
    }, () => new Date());

    await expect(sessions.find("not-a-session-token")).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
