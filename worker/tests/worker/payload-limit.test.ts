import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "../../src/core/config";
import { createHttpApp } from "../../src/http/app";
import type { ProductService } from "../../src/services/product-service";
import type { SessionRecord, SessionService } from "../../src/services/session-service";
import { allowAllRateLimiter, fixedClientIpResolver } from "../helpers/rate-limit";

const encoder = new TextEncoder();
const sessionCookie = "A".repeat(43);
const session: SessionRecord = {
  sessionIdHash: "session-hash",
  csrfTokenHash: "csrf-hash",
  adminUsername: null,
  expiresAt: new Date("2030-01-01T00:00:00Z"),
};

function reservationBody(byteLength?: number): string {
  const input = {
    roomId: "00000000-0000-4000-8000-000000000001",
    applicantName: "Testing applicant",
    applicantEmail: "testing@example.test",
    applicantPhone: "010-0000-0000",
    purpose: "Testing purpose",
    startAt: "2026-01-01T10:00:00+09:00",
    endAt: "2026-01-01T11:00:00+09:00",
    cancelPassword: "Abcd1234!",
    padding: "",
  };
  const base = JSON.stringify(input);
  if (byteLength === undefined) return base;
  input.padding = "a".repeat(byteLength - encoder.encode(base).byteLength);
  return JSON.stringify(input);
}

function testApp() {
  const calls = { sessionFind: 0, authenticate: 0, product: 0 };
  const products = {
    createPublicReservation: async () => {
      calls.product += 1;
      return { id: "00000000-0000-4000-8000-000000000001" };
    },
  } as unknown as ProductService;
  const sessions = {
    find: async () => {
      calls.sessionFind += 1;
      return session;
    },
    validateCsrf: async () => true,
    authenticate: async () => {
      calls.authenticate += 1;
    },
  } as unknown as SessionService;
  return {
    app: createHttpApp(
      parseRuntimeConfig({ APP_ENV: "test", E2E_CLEANUP_ENABLED: "false" }),
      {
        products,
        sessions,
        rateLimiter: allowAllRateLimiter,
        resolveClientIp: fixedClientIpResolver,
        adminUsername: "admin",
        adminPassword: "secret",
      },
    ),
    calls,
  };
}

function jsonHeaders(contentLength?: string): HeadersInit {
  return {
    "content-type": "application/json",
    cookie: `ROOM-SESSION=${sessionCookie}; XSRF-TOKEN=csrf-token`,
    "X-XSRF-TOKEN": "csrf-token",
    ...(contentLength ? { "content-length": contentLength } : {}),
  };
}

function streamRequest(body: ReadableStream<Uint8Array>, contentLength?: string): Request {
  return new Request("http://worker.test/api/public/reservations", {
    method: "POST",
    headers: jsonHeaders(contentLength),
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("JSON request body limit", () => {
  it("allows ordinary JSON and exactly 65,536 UTF-8 bytes", async () => {
    const ordinary = testApp();
    expect((await ordinary.app.request("/api/public/reservations", {
      method: "POST",
      headers: jsonHeaders(),
      body: reservationBody(),
    })).status).toBe(201);

    const boundary = reservationBody(65_536);
    expect(encoder.encode(boundary)).toHaveLength(65_536);
    const exact = testApp();
    expect((await exact.app.request("/api/public/reservations", {
      method: "POST",
      headers: jsonHeaders(),
      body: boundary,
    })).status).toBe(201);
    expect(exact.calls.product).toBe(1);
  });

  it("rejects 65,537 bytes before session, database, or product work", async () => {
    const { app, calls } = testApp();
    const body = reservationBody(65_537);
    const response = await app.request("/api/public/reservations", {
      method: "POST",
      headers: jsonHeaders(),
      body,
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      code: "PAYLOAD_TOO_LARGE",
      message: "JSON request body must not exceed 64 KiB.",
      details: {},
      fieldErrors: [],
      path: "/api/public/reservations",
    });
    expect(calls).toEqual({ sessionFind: 0, authenticate: 0, product: 0 });
  });

  it("counts multibyte characters by UTF-8 bytes", async () => {
    const { app, calls } = testApp();
    const body = `{"x":"${"한".repeat(21_843)}"}`;
    expect(body.length).toBeLessThan(65_536);
    expect(encoder.encode(body)).toHaveLength(65_537);

    const response = await app.request("/api/public/reservations", {
      method: "POST",
      headers: jsonHeaders(),
      body,
    });
    expect(response.status).toBe(413);
    expect(calls.sessionFind).toBe(0);
  });

  it("rejects an oversized valid Content-Length without reading the body", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(encoder.encode("{}"));
        controller.close();
      },
    }, { highWaterMark: 0 });
    const { app, calls } = testApp();

    const response = await app.request(streamRequest(body, "65537"));

    expect(response.status).toBe(413);
    expect(pulls).toBe(0);
    expect(calls.sessionFind).toBe(0);
  });

  it.each([undefined, "1"])("rejects a streamed oversized body with Content-Length %s and cancels the reader", async (contentLength) => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(65_537));
      },
      cancel() {
        cancelled = true;
      },
    }, { highWaterMark: 0 });
    const { app, calls } = testApp();

    const response = await app.request(streamRequest(body, contentLength));

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(calls.sessionFind).toBe(0);
  });

  it.each([
    ["empty JSON", undefined, "application/json"],
    ["invalid JSON", "{", "application/json"],
    ["invalid UTF-8", new Uint8Array([0xff]), "application/json"],
    ["non-JSON content", "not-json", "text/plain"],
  ])("keeps the existing 400 contract for %s", async (_label, body, contentType) => {
    const { app, calls } = testApp();
    const response = await app.request("/api/public/reservations", {
      method: "POST",
      headers: { ...jsonHeaders(), "content-type": contentType },
      ...(body === undefined ? {} : { body }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      path: "/api/public/reservations",
    });
    expect(calls.product).toBe(0);
  });
});
