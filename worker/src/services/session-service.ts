import { createOpaqueToken, sha256 } from "../core/security";
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
    if (!sessionId) return null;
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
    const expiresAt = new Date(this.now().getTime() + 8 * 60 * 60 * 1000);
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

  async authenticate(record: SessionRecord, username: string): Promise<void> {
    await this.database.query(
      "UPDATE admin_sessions SET admin_username=$2,updated_at=now() WHERE session_id_hash=$1",
      [record.sessionIdHash, username],
    );
    record.adminUsername = username;
  }

  async delete(record: SessionRecord | null): Promise<void> {
    if (record) await this.database.query("DELETE FROM admin_sessions WHERE session_id_hash=$1", [record.sessionIdHash]);
  }
}
