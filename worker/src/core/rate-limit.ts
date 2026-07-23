export type RateLimitPolicy = "READ" | "WRITE";

export interface RateLimitRequest {
  policy: RateLimitPolicy;
  actorKey: string;
}

export interface RateLimiter {
  check(request: RateLimitRequest): Promise<{ allowed: boolean }>;
}

export interface ClientIpProvider {
  getClientIp(request: Request): string | null;
}
