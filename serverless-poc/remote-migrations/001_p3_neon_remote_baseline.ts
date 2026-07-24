import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createExtension("btree_gist", { ifNotExists: true });
  pgm.createExtension("pgcrypto", { ifNotExists: true });
  pgm.sql(`
    CREATE TABLE p3_neon_rooms (
      id uuid PRIMARY KEY,
      name text NOT NULL UNIQUE
    );

    CREATE TABLE p3_neon_reservations (
      id uuid PRIMARY KEY,
      room_id uuid REFERENCES p3_neon_rooms(id) ON DELETE SET NULL,
      room_name_snapshot text NOT NULL,
      purpose text NOT NULL,
      status text NOT NULL CHECK (status IN ('REQUESTED', 'CONFIRMED', 'CANCELLED')),
      start_at timestamptz NOT NULL,
      end_at timestamptz NOT NULL,
      CHECK (end_at > start_at),
      CONSTRAINT p3_neon_no_active_reservation_overlap
        EXCLUDE USING gist (
          room_id WITH =,
          tstzrange(start_at, end_at, '[)') WITH &&
        ) WHERE (status IN ('REQUESTED', 'CONFIRMED'))
    );

    CREATE TABLE p3_neon_reservation_events (
      id uuid PRIMARY KEY,
      reservation_id uuid NOT NULL,
      event_type text NOT NULL CHECK (
        event_type IN ('CREATED', 'STATUS_CHANGED', 'TIME_CHANGED')
      ),
      room_name_snapshot text NOT NULL,
      before_value jsonb,
      after_value jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX p3_neon_reservation_events_reservation_idx
      ON p3_neon_reservation_events (reservation_id, created_at);

    CREATE TABLE p3_neon_sessions (
      session_id_hash text PRIMARY KEY,
      csrf_token_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX p3_neon_sessions_expiry_idx ON p3_neon_sessions (expires_at);

    CREATE TABLE p3_neon_transaction_probe (
      marker text PRIMARY KEY,
      transport text NOT NULL CHECK (transport IN ('http', 'websocket')),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE p3_neon_password_probe (
      id uuid PRIMARY KEY,
      password_hash text NOT NULL CHECK (password_hash LIKE '$2%'),
      cost integer NOT NULL CHECK (cost BETWEEN 4 AND 31),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE IF EXISTS p3_neon_password_probe;
    DROP TABLE IF EXISTS p3_neon_transaction_probe;
    DROP TABLE IF EXISTS p3_neon_sessions;
    DROP TABLE IF EXISTS p3_neon_reservation_events;
    DROP TABLE IF EXISTS p3_neon_reservations;
    DROP TABLE IF EXISTS p3_neon_rooms;
  `);
}
