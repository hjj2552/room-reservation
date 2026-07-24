import { expect, it } from "vitest";
import { parseRuntimeConfig } from "../../src/core/runtime-config";

it("rejects ambiguous environment and cleanup flag values", () => {
  expect(() => parseRuntimeConfig({ APP_ENV: "production", E2E_CLEANUP_ENABLED: "true" })).toThrow();
  expect(() => parseRuntimeConfig({ APP_ENV: "prod", E2E_CLEANUP_ENABLED: "TRUE" })).toThrow();
  expect(parseRuntimeConfig({ APP_ENV: "prod", E2E_CLEANUP_ENABLED: "false" })).toEqual({
    appEnvironment: "prod",
    e2eCleanupEnabled: false,
  });
});
