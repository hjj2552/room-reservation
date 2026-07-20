import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type {
  CleanupPort,
  RateLimitAttempt,
  RateLimitDecision,
  RateLimitStore,
  SessionRecord,
  SessionStore,
} from "../core/ports";

type P3NeonQuery = NeonQueryFunction<false, false>;

export class NeonP3Repository implements SessionStore, RateLimitStore, CleanupPort {
  constructor(private readonly sql: P3NeonQuery) {}

  static fromConnectionString(connectionString: string): NeonP3Repository {
    return new NeonP3Repository(neon(connectionString));
  }

  async create(record: SessionRecord): Promise<void> {
    await this.sql`
      INSERT INTO p3_poc_sessions (session_id_hash, csrf_token_hash, expires_at)
      VALUES (${record.sessionIdHash}, ${record.csrfTokenHash}, ${record.expiresAt})
    `;
  }

  async find(sessionIdHash: string): Promise<SessionRecord | null> {
    const rows = await this.sql`
      SELECT session_id_hash, csrf_token_hash, expires_at
      FROM p3_poc_sessions
      WHERE session_id_hash = ${sessionIdHash}
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      sessionIdHash: String(row.session_id_hash),
      csrfTokenHash: String(row.csrf_token_hash),
      expiresAt: new Date(String(row.expires_at)),
    };
  }

  async delete(sessionIdHash: string): Promise<void> {
    await this.sql`DELETE FROM p3_poc_sessions WHERE session_id_hash = ${sessionIdHash}`;
  }

  async consume(attempt: RateLimitAttempt): Promise<RateLimitDecision> {
    const rows = await this.sql`
      WITH attempted AS (
        INSERT INTO p3_poc_rate_limit_buckets (
          scope, bucket_key_hash, window_started_at, request_count
        ) VALUES (
          ${attempt.scope}, ${attempt.keyHash}, ${attempt.windowStartedAt}, 1
        )
        ON CONFLICT (scope, bucket_key_hash, window_started_at)
        DO UPDATE SET request_count = p3_poc_rate_limit_buckets.request_count + 1
        WHERE p3_poc_rate_limit_buckets.request_count < ${attempt.limit}
        RETURNING request_count
      )
      SELECT
        EXISTS (SELECT 1 FROM attempted) AS allowed,
        COALESCE(
          (SELECT request_count FROM attempted),
          (SELECT request_count FROM p3_poc_rate_limit_buckets
           WHERE scope = ${attempt.scope}
             AND bucket_key_hash = ${attempt.keyHash}
             AND window_started_at = ${attempt.windowStartedAt})
        ) AS request_count
    `;
    const row = rows[0];
    if (!row) throw new Error("Rate limit counter returned no decision");
    return {
      allowed: Boolean(row.allowed),
      count: Number(row.request_count),
      retryAfterSeconds: 60,
    };
  }

  async deleteMarkedTestData(): Promise<void> {
    await this.sql`
      DELETE FROM p3_poc_reservations
      WHERE purpose LIKE 'testing-%'
    `;
  }
}
