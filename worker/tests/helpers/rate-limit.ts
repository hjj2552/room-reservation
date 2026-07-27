import type { RateLimiter, RateLimitRequest } from "../../src/core/rate-limit";

export const allowAllRateLimiter: RateLimiter = {
  check: async () => ({ allowed: true }),
};

export const fixedClientIpResolver = () => "192.0.2.1";

export class DeterministicRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  async check(request: RateLimitRequest): Promise<{ allowed: boolean }> {
    const counterKey = `${request.policy}:${request.actorKey}`;
    const count = (this.counts.get(counterKey) ?? 0) + 1;
    this.counts.set(counterKey, count);
    return {
      allowed: count <= (
        request.policy === "INGRESS"
          ? 600
          : request.policy === "READ"
            ? 120
            : 24
      ),
    };
  }
}

export const headerClientIpResolver = (request: Request) => request.headers.get("x-test-client-ip");
