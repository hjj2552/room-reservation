const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_BYTES = 32;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const value = new Uint8Array(length);
  crypto.getRandomValues(value);
  return value;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    PASSWORD_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

export async function hashPublicPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = await pbkdf2(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toBase64(salt)}$${toBase64(digest)}`;
}

export async function verifyPublicPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, digestText, extra] = encoded.split("$");
  const iterations = Number(iterationsText);
  if (
    algorithm !== "pbkdf2-sha256" ||
    !Number.isSafeInteger(iterations) ||
    iterations !== PASSWORD_ITERATIONS ||
    !saltText ||
    !digestText ||
    extra !== undefined
  ) {
    return false;
  }
  try {
    return constantTimeEqual(
      await pbkdf2(password, fromBase64(saltText), iterations),
      fromBase64(digestText),
    );
  } catch {
    return false;
  }
}

export function createOpaqueToken(): string {
  return toBase64(randomBytes(32)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function hashOpaqueToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64(new Uint8Array(digest));
}
