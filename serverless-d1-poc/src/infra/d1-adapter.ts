import type {
  ReservationDraft,
  ReservationRepository,
  SessionRecord,
  SessionStore,
} from "../core/ports";

export class ReservationConflictError extends Error {
  constructor() {
    super("RESERVATION_CONFLICT");
  }
}

function isReservationConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes("reservation_conflict");
}

export class D1ReservationRepository implements ReservationRepository {
  constructor(private readonly db: D1Database) {}

  async createWithAuditEvent(reservation: ReservationDraft): Promise<void> {
    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO p3_d1_reservations
               (id, room_id, status, start_at_utc_ms, end_at_utc_ms, purpose, created_at_utc_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            reservation.id,
            reservation.roomId,
            reservation.status,
            reservation.startAtUtcMs,
            reservation.endAtUtcMs,
            reservation.purpose,
            reservation.createdAtUtcMs,
          ),
        this.db
          .prepare(
            `INSERT INTO p3_d1_reservation_events
               (id, reservation_id, event_type, created_at_utc_ms)
             VALUES (?, ?, 'CREATED', ?)`,
          )
          .bind(crypto.randomUUID(), reservation.id, reservation.createdAtUtcMs),
      ]);
    } catch (error) {
      if (isReservationConflict(error)) throw new ReservationConflictError();
      throw error;
    }
  }
}

export class D1SessionStore implements SessionStore {
  constructor(private readonly db: D1Database) {}

  async create(record: SessionRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO p3_d1_admin_sessions
           (session_id_digest, csrf_token_digest, expires_at_utc_ms, created_at_utc_ms)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(
        record.sessionIdDigest,
        record.csrfTokenDigest,
        record.expiresAtUtcMs,
        record.createdAtUtcMs,
      )
      .run();
  }

  async find(sessionIdDigest: string): Promise<SessionRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT session_id_digest, csrf_token_digest, expires_at_utc_ms, created_at_utc_ms
         FROM p3_d1_admin_sessions
         WHERE session_id_digest = ?`,
      )
      .bind(sessionIdDigest)
      .first<{
        session_id_digest: string;
        csrf_token_digest: string;
        expires_at_utc_ms: number;
        created_at_utc_ms: number;
      }>();
    return row
      ? {
          sessionIdDigest: row.session_id_digest,
          csrfTokenDigest: row.csrf_token_digest,
          expiresAtUtcMs: row.expires_at_utc_ms,
          createdAtUtcMs: row.created_at_utc_ms,
        }
      : null;
  }

  async delete(sessionIdDigest: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM p3_d1_admin_sessions WHERE session_id_digest = ?")
      .bind(sessionIdDigest)
      .run();
  }
}
