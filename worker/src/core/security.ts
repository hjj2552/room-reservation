const encoder = new TextEncoder();
const OPAQUE_TOKEN_BYTES = 32;
const opaqueTokenPattern = /^[A-Za-z0-9_-]{43}$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function createOpaqueToken(): string {
  const value = new Uint8Array(OPAQUE_TOKEN_BYTES);
  crypto.getRandomValues(value);
  return toBase64Url(value);
}

export function isValidOpaqueToken(value: unknown): value is string {
  return typeof value === "string" && opaqueTokenPattern.test(value);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
}

export async function constantTimeSecretEqual(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([sha256(left), sha256(right)]);
  if (leftDigest.length !== rightDigest.length) return false;
  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1) {
    difference |= leftDigest.charCodeAt(index) ^ rightDigest.charCodeAt(index);
  }
  return difference === 0;
}

export const publicPasswordPattern = /^[\x21-\x7E]{4,64}$/;

export function isValidPublicPassword(value: unknown): value is string {
  return typeof value === "string" && publicPasswordPattern.test(value);
}
