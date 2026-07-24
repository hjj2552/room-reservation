export type AppEnvironment = "local" | "test" | "e2e" | "uat" | "prod";

export interface SessionRecord {
  sessionIdHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
}

export interface SessionStore {
  create(record: SessionRecord): Promise<void>;
  find(sessionIdHash: string): Promise<SessionRecord | null>;
  delete(sessionIdHash: string): Promise<void>;
}

export interface RateLimitAttempt {
  scope: "public-read" | "public-write";
  keyHash: string;
  windowStartedAt: Date;
  limit: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  consume(attempt: RateLimitAttempt): Promise<RateLimitDecision>;
}

export interface CleanupPort {
  deleteMarkedTestData(): Promise<void>;
}
