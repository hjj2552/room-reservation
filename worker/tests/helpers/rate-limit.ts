import type {
  ClientIpProvider,
  RateLimiter,
  RateLimitRequest,
} from "../../src/core/rate-limit";

export const allowAllRateLimiter: RateLimiter = {
  check: async () => ({ allowed: true }),
};

export const fixedClientIpProvider: ClientIpProvider = {
  getClientIp: () => "192.0.2.1",
};

export class DeterministicRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  async check(request: RateLimitRequest): Promise<{ allowed: boolean }> {
    const counterKey = `${request.policy}:${request.actorKey}`;
    const count = (this.counts.get(counterKey) ?? 0) + 1;
    this.counts.set(counterKey, count);
    return {
      allowed: count <= (request.policy === "READ" ? 120 : 24),
    };
  }
}

export const headerClientIpProvider: ClientIpProvider = {
  getClientIp: (request) => request.headers.get("x-test-client-ip"),
};
