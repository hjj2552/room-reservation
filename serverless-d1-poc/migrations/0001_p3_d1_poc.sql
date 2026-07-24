-- P3 experiment only. This is not the product baseline V1 schema.
PRAGMA foreign_keys = ON;

CREATE TABLE p3_d1_rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
) STRICT;

CREATE TABLE p3_d1_reservations (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES p3_d1_rooms(id),
  status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'CONFIRMED', 'CANCELLED')),
  start_at_utc_ms INTEGER NOT NULL CHECK (start_at_utc_ms % 300000 = 0),
  end_at_utc_ms INTEGER NOT NULL CHECK (end_at_utc_ms % 300000 = 0),
  purpose TEXT NOT NULL,
  created_at_utc_ms INTEGER NOT NULL,
  CHECK (end_at_utc_ms > start_at_utc_ms),
  CHECK (end_at_utc_ms - start_at_utc_ms >= 1800000)
) STRICT;

CREATE INDEX p3_d1_reservations_conflict_lookup
  ON p3_d1_reservations (room_id, status, start_at_utc_ms, end_at_utc_ms);

CREATE TRIGGER p3_d1_reservations_no_overlap_insert
BEFORE INSERT ON p3_d1_reservations
WHEN NEW.status IN ('REQUESTED', 'CONFIRMED')
 AND EXISTS (
   SELECT 1
   FROM p3_d1_reservations AS existing
   WHERE existing.room_id = NEW.room_id
     AND existing.status IN ('REQUESTED', 'CONFIRMED')
     AND existing.start_at_utc_ms < NEW.end_at_utc_ms
     AND existing.end_at_utc_ms > NEW.start_at_utc_ms
 )
BEGIN
  SELECT RAISE(ABORT, 'reservation_conflict');
END;

CREATE TRIGGER p3_d1_reservations_no_overlap_update
BEFORE UPDATE OF room_id, status, start_at_utc_ms, end_at_utc_ms ON p3_d1_reservations
WHEN NEW.status IN ('REQUESTED', 'CONFIRMED')
 AND EXISTS (
   SELECT 1
   FROM p3_d1_reservations AS existing
   WHERE existing.id <> OLD.id
     AND existing.room_id = NEW.room_id
     AND existing.status IN ('REQUESTED', 'CONFIRMED')
     AND existing.start_at_utc_ms < NEW.end_at_utc_ms
     AND existing.end_at_utc_ms > NEW.start_at_utc_ms
 )
BEGIN
  SELECT RAISE(ABORT, 'reservation_conflict');
END;

CREATE TABLE p3_d1_reservation_events (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES p3_d1_reservations(id),
  event_type TEXT NOT NULL,
  created_at_utc_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE p3_d1_admin_sessions (
  session_id_digest TEXT PRIMARY KEY,
  csrf_token_digest TEXT NOT NULL,
  expires_at_utc_ms INTEGER NOT NULL,
  created_at_utc_ms INTEGER NOT NULL
) STRICT;

CREATE INDEX p3_d1_admin_sessions_expiry
  ON p3_d1_admin_sessions (expires_at_utc_ms);
