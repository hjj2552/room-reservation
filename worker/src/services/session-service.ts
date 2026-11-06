import { createOpaqueToken, isValidOpaqueToken, sha256 } from "../core/security";
import type { Database } from "../infra/database";

export interface SessionRecord {
  sessionIdHash: string;
  csrfTokenHash: string;
  adminUsername: string | null;
  expiresAt: Date;
}

const EXPIRED_SESSION_DELETE_LIMIT = 100;

export class SessionService {
  constructor(
    private readonly database: Database,
    private readonly now: () => Date,
  ) {}

  async find(sessionId: string | undefined): Promise<SessionRecord | null> {
    if (!isValidOpaqueToken(sessionId)) return null;
    const sessionIdHash = await sha256(sessionId);
    const result = await this.database.query(
      `SELECT session_id_hash, csrf_token_hash, admin_username, expires_at
       FROM admin_sessions WHERE session_id_hash=$1`,
      [sessionIdHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    const expiresAt = row.expires_at instanceof Date ? row.expires_at : new Date(String(row.expires_at));
    if (expiresAt.getTime() <= this.now().getTime()) {
      await this.database.query("DELETE FROM admin_sessions WHERE session_id_hash=$1", [sessionIdHash]);
      return null;
    }
    return {
      sessionIdHash,
      csrfTokenHash: String(row.csrf_token_hash),
      adminUsername: row.admin_username === null ? null : String(row.admin_username),
      expiresAt,
    };
  }

  async issue(): Promise<{ sessionId: string; csrfToken: string; record: SessionRecord }> {
    await this.database.query(
      `WITH expired AS (
         SELECT session_id_hash FROM admin_sessions
         WHERE expires_at <= $1
         ORDER BY expires_at ASC, session_id_hash ASC
         LIMIT $2
       )
       DELETE FROM admin_sessions session
       USING expired
       WHERE session.session_id_hash=expired.session_id_hash`,
      [this.now(), EXPIRED_SESSION_DELETE_LIMIT],
    );
    const sessionId = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const expiresAt = new Date(this.now().getTime() + 12 * 60 * 60 * 1000);
    const record = {
      sessionIdHash: await sha256(sessionId),
      csrfTokenHash: await sha256(csrfToken),
      adminUsername: null,
      expiresAt,
    };
    await this.database.query(
      `INSERT INTO admin_sessions(session_id_hash,csrf_token_hash,expires_at)
       VALUES($1,$2,$3)`,
      [record.sessionIdHash, record.csrfTokenHash, expiresAt],
    );
    return { sessionId, csrfToken, record };
  }

  async validateCsrf(record: SessionRecord | null, cookieToken: string | undefined, headerToken: string | undefined) {
    if (!record || !cookieToken || !headerToken || cookieToken !== headerToken) return false;
    return record.csrfTokenHash === await sha256(headerToken);
  }

  async authenticate(record: SessionRecord, username: string) {
    const sessionId = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const sessionIdHash = await sha256(sessionId);
    const csrfTokenHash = await sha256(csrfToken);
    return this.database.transaction(async (client) => {
      const result = await client.query(
        "SELECT expires_at FROM admin_sessions WHERE session_id_hash=$1 FOR UPDATE",
        [record.sessionIdHash],
      );
      const row = result.rows[0];
      if (!row) return null;
      const expiresAt = row.expires_at instanceof Date ? row.expires_at : new Date(String(row.expires_at));
      // Check after acquiring the lock: another login may have consumed or outlived this session.
      if (expiresAt.getTime() <= this.now().getTime()) return null;
      await client.query("DELETE FROM admin_sessions WHERE session_id_hash=$1", [record.sessionIdHash]);
      await client.query(
        `INSERT INTO admin_sessions(session_id_hash,csrf_token_hash,admin_username,expires_at)
         VALUES($1,$2,$3,$4)`,
        [sessionIdHash, csrfTokenHash, username, expiresAt],
      );
      return { sessionId, csrfToken, record: { sessionIdHash, csrfTokenHash, adminUsername: username, expiresAt } };
    });
  }

  async delete(record: SessionRecord | null): Promise<boolean> {
    if (!record) return false;
    const result = await this.database.query(
      "DELETE FROM admin_sessions WHERE session_id_hash=$1 RETURNING session_id_hash", [record.sessionIdHash],
    );
    return result.rows.length === 1;
  }
}
