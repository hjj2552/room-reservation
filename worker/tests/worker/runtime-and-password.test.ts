import { describe, expect, it } from "vitest";
import { parseRuntimeConfig, shouldRegisterCleanup } from "../../src/core/config";
import { isValidPublicPassword } from "../../src/core/security";

describe("runtime cleanup guard", () => {
  it("requires both non-prod and an explicit true flag", () => {
    expect(shouldRegisterCleanup(parseRuntimeConfig({ APP_ENV: "uat", E2E_CLEANUP_ENABLED: "true" }))).toBe(true);
    expect(shouldRegisterCleanup(parseRuntimeConfig({ APP_ENV: "uat", E2E_CLEANUP_ENABLED: "false" }))).toBe(false);
    expect(shouldRegisterCleanup(parseRuntimeConfig({ APP_ENV: "prod", E2E_CLEANUP_ENABLED: "true" }))).toBe(false);
  });

  it("rejects unknown environments and implicit flags", () => {
    expect(() => parseRuntimeConfig({ APP_ENV: "production", E2E_CLEANUP_ENABLED: "false" })).toThrow();
    expect(() => parseRuntimeConfig({ APP_ENV: "uat" })).toThrow();
  });
});

describe("public reservation password policy", () => {
  it("accepts printable ASCII at the 4 and 64 character boundaries", () => {
    expect(isValidPublicPassword("Aa1!" )).toBe(true);
    expect(isValidPublicPassword("A".repeat(64))).toBe(true);
    expect(isValidPublicPassword("~!Zz09" )).toBe(true);
  });

  it("rejects lengths and every non-printable/non-ASCII class", () => {
    expect(isValidPublicPassword("A1!" )).toBe(false);
    expect(isValidPublicPassword("A".repeat(65))).toBe(false);
    expect(isValidPublicPassword("pass word")).toBe(false);
    expect(isValidPublicPassword("비밀번호1!" )).toBe(false);
    expect(isValidPublicPassword("pass😀" )).toBe(false);
    expect(isValidPublicPassword("Ｐａｓｓ" )).toBe(false);
  });

  it("is case-sensitive by construction", () => {
    expect("Case1!" ).not.toBe("case1!" );
    expect(isValidPublicPassword("Case1!" )).toBe(true);
    expect(isValidPublicPassword("case1!" )).toBe(true);
  });
});
