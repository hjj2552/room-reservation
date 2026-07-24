export type ReservationStatus = "REQUESTED" | "CONFIRMED" | "CANCELLED";

export interface ReservationDraft {
  id: string;
  roomId: string;
  status: ReservationStatus;
  startAtUtcMs: number;
  endAtUtcMs: number;
  purpose: string;
  createdAtUtcMs: number;
}

export interface ReservationRepository {
  createWithAuditEvent(reservation: ReservationDraft): Promise<void>;
}

export interface SessionRecord {
  sessionIdDigest: string;
  csrfTokenDigest: string;
  expiresAtUtcMs: number;
  createdAtUtcMs: number;
}

export interface SessionStore {
  create(record: SessionRecord): Promise<void>;
  find(sessionIdDigest: string): Promise<SessionRecord | null>;
  delete(sessionIdDigest: string): Promise<void>;
}
