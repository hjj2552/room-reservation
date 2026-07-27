import { describe, expect, it } from "vitest";
import { AppError, type ApplicationErrorKind } from "../../src/core/errors";
import { parseRuntimeConfig } from "../../src/core/config";
import { createHttpApp } from "../../src/http/app";
import { HttpError, mapApplicationError, mapHttpError } from "../../src/http/errors";
import type { ProductService } from "../../src/services/product-service";
import type { SessionService } from "../../src/services/session-service";
import { allowAllRateLimiter, fixedClientIpResolver } from "../helpers/rate-limit";

function appThatThrows(error: Error) {
  const products = {
    getPublicSettings: async () => {
      throw error;
    },
  } as unknown as ProductService;
  const sessions = {
    find: async () => null,
    validateCsrf: async () => true,
  } as unknown as SessionService;
  return createHttpApp(
    parseRuntimeConfig({ APP_ENV: "local", E2E_CLEANUP_ENABLED: "false" }),
    {
      products,
      sessions,
      rateLimiter: allowAllRateLimiter,
      resolveClientIp: fixedClientIpResolver,
      adminUsername: "admin",
      adminPassword: "secret",
    },
  );
}

describe("application error HTTP mapping", () => {
  it.each([
    ["VALIDATION", 400],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["POLICY_VIOLATION", 422],
    ["CREDENTIAL_MISMATCH", 403],
  ] as const)("maps %s explicitly to %d", (kind, status) => {
    const error = new AppError(
      kind satisfies ApplicationErrorKind,
      "TEST_CODE",
      "test message",
      { marker: true },
      [{ field: "name", message: "invalid" }],
    );
    expect(mapApplicationError(error)).toEqual({
      status,
      body: {
        code: "TEST_CODE",
        message: "test message",
        details: { marker: true },
        fieldErrors: [{ field: "name", message: "invalid" }],
      },
    });
    expect(error).not.toHaveProperty("status");
  });

  it.each([
    [400, "VALIDATION_ERROR"],
    [401, "ADMIN_UNAUTHORIZED"],
    [403, "INVALID_CSRF_TOKEN"],
    [429, "RATE_LIMIT_EXCEEDED"],
    [503, "RATE_LIMIT_UNAVAILABLE"],
  ] as const)("keeps HTTP-boundary error %d/%s outside application errors", (status, code) => {
    expect(mapHttpError(new HttpError(status, code, "message"))).toEqual({
      status,
      body: {
        code,
        message: "message",
        details: {},
        fieldErrors: [],
      },
    });
  });

  it.each([
    ["VALIDATION", 400],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["POLICY_VIOLATION", 422],
    ["CREDENTIAL_MISMATCH", 403],
  ] as const)("renders application %s through the HTTP adapter as %d", async (kind, status) => {
    const response = await appThatThrows(
      new AppError(kind, "TEST_CODE", "test message", { marker: true }),
    ).request("/api/public/settings");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      code: "TEST_CODE",
      message: "test message",
      details: { marker: true },
      fieldErrors: [],
      path: "/api/public/settings",
    });
  });

  it("keeps unexpected errors as a generic 500", async () => {
    const response = await appThatThrows(new Error("database secret")).request(
      "/api/public/settings",
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    });
  });
});
