import type { AppEnvironment } from "../core/ports";

export function getTrustedClientIp(request: Request, environment: AppEnvironment): string {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  if (environment === "local" || environment === "test") {
    const testIp = request.headers.get("x-p3-test-client-ip")?.trim();
    if (testIp) return testIp;
  }

  throw new Error("Trusted Cloudflare client IP is unavailable");
}
