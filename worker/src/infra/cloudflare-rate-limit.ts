import type { RateLimiter, RateLimitRequest } from "../core/rate-limit";

interface CloudflareRateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export class CloudflareRateLimiter implements RateLimiter {
  constructor(
    private readonly readBinding: CloudflareRateLimitBinding,
    private readonly writeBinding: CloudflareRateLimitBinding,
  ) {}

  async check(request: RateLimitRequest): Promise<{ allowed: boolean }> {
    const binding = request.policy === "READ" ? this.readBinding : this.writeBinding;
    const outcome = await binding.limit({ key: request.actorKey });
    return { allowed: outcome.success };
  }
}
