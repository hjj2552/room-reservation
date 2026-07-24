import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createExtension("btree_gist", { ifNotExists: true });
  pgm.sql(`
    CREATE TABLE p3_poc_rooms (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name text NOT NULL UNIQUE
    );

    CREATE TABLE p3_poc_reservations (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      room_id bigint NOT NULL REFERENCES p3_poc_rooms(id),
      purpose text NOT NULL,
      status text NOT NULL CHECK (status IN ('REQUESTED', 'CONFIRMED', 'CANCELLED')),
      start_at timestamptz NOT NULL,
      end_at timestamptz NOT NULL,
      CHECK (end_at > start_at),
      CHECK (date_trunc('minute', start_at) = start_at),
      CHECK (date_trunc('minute', end_at) = end_at),
      CHECK ((extract(minute FROM start_at)::integer % 5) = 0),
      CHECK ((extract(minute FROM end_at)::integer % 5) = 0),
      CONSTRAINT p3_poc_no_active_reservation_overlap
        EXCLUDE USING gist (
          room_id WITH =,
          tstzrange(start_at, end_at, '[)') WITH &&
        ) WHERE (status IN ('REQUESTED', 'CONFIRMED'))
    );

    CREATE TABLE p3_poc_sessions (
      session_id_hash text PRIMARY KEY,
      csrf_token_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX p3_poc_sessions_expiry_idx ON p3_poc_sessions (expires_at);

    CREATE TABLE p3_poc_rate_limit_buckets (
      scope text NOT NULL CHECK (scope IN ('public-read', 'public-write')),
      bucket_key_hash text NOT NULL,
      window_started_at timestamptz NOT NULL,
      request_count integer NOT NULL CHECK (request_count > 0),
      PRIMARY KEY (scope, bucket_key_hash, window_started_at)
    );
    CREATE INDEX p3_poc_rate_limit_expiry_idx
      ON p3_poc_rate_limit_buckets (window_started_at);

    CREATE TABLE p3_poc_transaction_probe (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      marker text NOT NULL
    );
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE IF EXISTS p3_poc_transaction_probe;
    DROP TABLE IF EXISTS p3_poc_rate_limit_buckets;
    DROP TABLE IF EXISTS p3_poc_sessions;
    DROP TABLE IF EXISTS p3_poc_reservations;
    DROP TABLE IF EXISTS p3_poc_rooms;
  `);
}
