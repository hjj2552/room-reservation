import { expect, it } from "vitest";
import { hashPublicPassword, verifyPublicPassword } from "../../src/security/web-crypto";

it("hashes public reservation passwords with Worker Web Crypto", async () => {
  const password = "p3-public-password";
  const encoded = await hashPublicPassword(password);

  expect(encoded).toMatch(/^pbkdf2-sha256\$600000\$/);
  expect(encoded).not.toContain(password);
  await expect(verifyPublicPassword(password, encoded)).resolves.toBe(true);
  await expect(verifyPublicPassword("wrong-password", encoded)).resolves.toBe(false);
});
