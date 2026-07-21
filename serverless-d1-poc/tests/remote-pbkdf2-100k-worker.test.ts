import { describe, expect, it } from "vitest";
import probeWorker from "../remote/pbkdf2-100k-worker";

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function makeEnvironment() {
  const probeToken = crypto.randomUUID();
  const password = crypto.randomUUID();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const digest = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
    key,
    256,
  );
  return {
    probeToken,
    env: {
      PROBE_TOKEN: probeToken,
      TEST_PASSWORD: password,
      TEST_SALT_B64: toBase64(salt),
      TEST_DIGEST_B64: toBase64(new Uint8Array(digest)),
    },
  };
}

describe("remote 100,000-iteration PBKDF2 diagnostic Worker", () => {
  it("rejects unauthenticated requests before hashing", async () => {
    const { env } = await makeEnvironment();
    const response = await probeWorker.fetch(new Request("https://probe.test/hash", { method: "POST" }), env);
    expect(response.status).toBe(401);
  });

  it("runs one 100,000-iteration operation per endpoint with correct semantics", async () => {
    const { env, probeToken } = await makeEnvironment();
    const call = (path: string) =>
      probeWorker.fetch(
        new Request(`https://probe.test${path}`, {
          method: "POST",
          headers: { authorization: `Bearer ${probeToken}` },
        }),
        env,
      );

    const hash = await call("/hash");
    expect(hash.status).toBe(200);
    expect(await hash.json()).toMatchObject({ operation: "hash", completed: true });

    const valid = await call("/verify-valid");
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({ operation: "verify-valid", correct: true });

    const invalid = await call("/verify-invalid");
    expect(invalid.status).toBe(200);
    expect(await invalid.json()).toMatchObject({ operation: "verify-invalid", correct: false });
  });
});
