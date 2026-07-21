interface Env {
  PROBE_TOKEN: string;
  TEST_PASSWORD: string;
  TEST_SALT_B64: string;
  TEST_DIGEST_B64: string;
}

const encoder = new TextEncoder();
const ITERATIONS = 100_000;
const DIGEST_BYTES = 32;

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    DIGEST_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function unauthorized(): Response {
  return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("authorization") !== `Bearer ${env.PROBE_TOKEN}`) return unauthorized();
    if (request.method !== "POST") return Response.json({ code: "METHOD_NOT_ALLOWED" }, { status: 405 });

    const path = new URL(request.url).pathname;
    const startedAt = performance.now();
    if (path === "/hash") {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      await derive(env.TEST_PASSWORD, salt);
      return Response.json({ operation: "hash", completed: true, workerWallMs: performance.now() - startedAt });
    }

    const salt = fromBase64(env.TEST_SALT_B64);
    const expected = fromBase64(env.TEST_DIGEST_B64);
    if (path === "/verify-valid") {
      const actual = await derive(env.TEST_PASSWORD, salt);
      return Response.json({
        operation: "verify-valid",
        correct: constantTimeEqual(actual, expected),
        workerWallMs: performance.now() - startedAt,
      });
    }
    if (path === "/verify-invalid") {
      const actual = await derive(`incorrect:${env.TEST_PASSWORD}`, salt);
      return Response.json({
        operation: "verify-invalid",
        correct: constantTimeEqual(actual, expected),
        workerWallMs: performance.now() - startedAt,
      });
    }
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  },
};
