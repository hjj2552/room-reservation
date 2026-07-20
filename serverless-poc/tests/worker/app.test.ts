import { describe, expect, it } from "vitest";
import type { SessionRecord, SessionStore } from "../../src/core/ports";
import { createHttpApp } from "../../src/http/app";

class MemorySessionStore implements SessionStore {
  readonly records = new Map<string, SessionRecord>();

  async create(record: SessionRecord): Promise<void> {
    this.records.set(record.sessionIdHash, record);
  }

  async find(sessionIdHash: string): Promise<SessionRecord | null> {
    return this.records.get(sessionIdHash) ?? null;
  }

  async delete(sessionIdHash: string): Promise<void> {
    this.records.delete(sessionIdHash);
  }
}

function cookieValue(setCookieHeaders: string[], name: string): string {
  const entry = setCookieHeaders.find((value) => value.startsWith(`${name}=`));
  if (!entry) throw new Error(`Missing ${name} cookie`);
  return entry.split(";", 1)[0]!.slice(name.length + 1);
}

function makeApp(appEnvironment: "uat" | "prod", cleanupEnabled: boolean) {
  const sessions = new MemorySessionStore();
  let cleanupCalls = 0;
  const app = createHttpApp(
    { appEnvironment, e2eCleanupEnabled: cleanupEnabled },
    {
      sessions,
      cleanup: {
        async deleteMarkedTestData() {
          cleanupCalls += 1;
        },
      },
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    },
  );
  return { app, sessions, cleanupCalls: () => cleanupCalls };
}

describe("Worker HTTP boundary", () => {
  it("runs Hono in the Workers test runtime without leaking it into the core contract", async () => {
    const { app } = makeApp("uat", false);
    const response = await app.request("https://example.test/api/p3/runtime");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      runtime: "cloudflare-workers",
      http: "hono",
      core: "web-api-independent",
    });
  });

  it("keeps the session cookie and XSRF cookie/header contract", async () => {
    const { app } = makeApp("uat", false);
    const login = await app.request("https://example.test/api/p3/session", { method: "POST" });
    const setCookies = login.headers.getSetCookie();
    const session = cookieValue(setCookies, "P3-SESSION");
    const csrf = cookieValue(setCookies, "XSRF-TOKEN");

    expect(setCookies.find((value) => value.startsWith("P3-SESSION="))).toMatch(
      /HttpOnly; Secure; SameSite=Lax/i,
    );
    expect(setCookies.find((value) => value.startsWith("XSRF-TOKEN="))).toMatch(
      /Path=\/;.*Secure; SameSite=Lax/i,
    );
    expect(setCookies.find((value) => value.startsWith("XSRF-TOKEN="))).not.toMatch(/HttpOnly/i);

    const protectedResponse = await app.request("https://example.test/api/p3/protected", {
      method: "POST",
      headers: {
        cookie: `P3-SESSION=${session}; XSRF-TOKEN=${csrf}`,
        "X-XSRF-TOKEN": csrf,
      },
    });
    expect(protectedResponse.status).toBe(200);

    const rejected = await app.request("https://example.test/api/p3/protected", {
      method: "POST",
      headers: {
        cookie: `P3-SESSION=${session}; XSRF-TOKEN=${csrf}`,
        "X-XSRF-TOKEN": "wrong",
      },
    });
    expect(rejected.status).toBe(403);
  });

  it("registers cleanup only when both non-prod and explicit flag conditions hold", async () => {
    const enabled = makeApp("uat", true);
    expect(
      (await enabled.app.request("https://example.test/api/p3/e2e-cleanup", { method: "DELETE" }))
        .status,
    ).toBe(204);
    expect(enabled.cleanupCalls()).toBe(1);

    const missingFlag = makeApp("uat", false);
    expect(
      (await missingFlag.app.request("https://example.test/api/p3/e2e-cleanup", { method: "DELETE" }))
        .status,
    ).toBe(404);

    const production = makeApp("prod", true);
    expect(
      (await production.app.request("https://example.test/api/p3/e2e-cleanup", { method: "DELETE" }))
        .status,
    ).toBe(404);
    expect(production.cleanupCalls()).toBe(0);
  });

  it("trusts CF-Connecting-IP and ignores spoofable forwarding headers", async () => {
    const { app } = makeApp("prod", false);
    const trusted = await app.request("https://example.test/api/p3/client-ip", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.20",
      },
    });
    expect(await trusted.json()).toEqual({ clientIp: "203.0.113.10" });

    const untrusted = await app.request("https://example.test/api/p3/client-ip", {
      headers: { "x-forwarded-for": "198.51.100.20" },
    });
    expect(untrusted.status).toBe(400);
  });
});
