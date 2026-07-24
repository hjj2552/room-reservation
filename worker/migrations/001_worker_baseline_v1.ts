import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createExtension("pgcrypto", { ifNotExists: true });
  pgm.createExtension("btree_gist", { ifNotExists: true });
  pgm.sql(`
    CREATE TYPE reservation_status AS ENUM ('REQUESTED', 'CONFIRMED', 'CANCELLED');
    CREATE TYPE reservation_source AS ENUM ('PUBLIC_FORM', 'ADMIN_GRID', 'ADMIN_MANUAL', 'RECURRING_GENERATED');
    CREATE TYPE recurrence_conflict_policy AS ENUM ('SKIP_CONFLICTS', 'FAIL_ALL');
    CREATE TYPE actor_type AS ENUM ('PUBLIC_USER', 'ADMIN', 'SYSTEM');

    CREATE TABLE rooms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(100) NOT NULL,
      location varchar(150),
      capacity integer NOT NULL,
      description text,
      enabled boolean NOT NULL DEFAULT true,
      system_reserved boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT chk_rooms_name_not_blank CHECK (length(trim(name)) > 0),
      CONSTRAINT chk_rooms_capacity_non_negative CHECK (capacity >= 0)
    );

    CREATE UNIQUE INDEX ux_rooms_name_active ON rooms (name) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX ux_rooms_single_system_reserved
      ON rooms (system_reserved) WHERE system_reserved = true AND deleted_at IS NULL;
    CREATE INDEX idx_rooms_enabled ON rooms (enabled) WHERE deleted_at IS NULL;

    CREATE TABLE operation_settings (
      id smallint PRIMARY KEY,
      organization_name varchar(150) NOT NULL,
      public_notice text,
      reservation_enabled boolean NOT NULL DEFAULT false,
      reservation_disabled_message text,
      semester_start_date date NOT NULL,
      semester_end_date date NOT NULL,
      open_time time NOT NULL,
      close_time time NOT NULL,
      available_days_of_week varchar(50) NOT NULL,
      min_reservation_minutes integer NOT NULL,
      max_reservation_minutes integer NOT NULL,
      admin_contact_email varchar(255),
      admin_contact_phone varchar(50),
      completion_message text,
      updated_by varchar(100),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      version bigint NOT NULL DEFAULT 0,
      CONSTRAINT chk_operation_settings_singleton CHECK (id = 1),
      CONSTRAINT chk_operation_settings_org_not_blank CHECK (length(trim(organization_name)) > 0),
      CONSTRAINT chk_operation_settings_semester_range CHECK (semester_start_date <= semester_end_date),
      CONSTRAINT chk_operation_settings_time_range CHECK (open_time < close_time),
      CONSTRAINT chk_operation_settings_days_not_blank CHECK (length(trim(available_days_of_week)) > 0),
      CONSTRAINT chk_operation_settings_grid CHECK (
        extract(second FROM open_time) = 0
        AND extract(second FROM close_time) = 0
        AND extract(minute FROM open_time)::integer % 30 = 0
        AND extract(minute FROM close_time)::integer % 30 = 0
      ),
      CONSTRAINT chk_operation_settings_min_minutes CHECK (
        min_reservation_minutes >= 30
        AND min_reservation_minutes % 5 = 0
        AND min_reservation_minutes <= extract(epoch FROM (close_time - open_time)) / 60
      ),
      CONSTRAINT chk_operation_settings_max_minutes CHECK (
        max_reservation_minutes >= min_reservation_minutes
        AND max_reservation_minutes % 5 = 0
      )
    );

    CREATE TABLE tags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(100) NOT NULL,
      color varchar(20) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_tags_name_not_blank CHECK (length(trim(name)) > 0),
      CONSTRAINT chk_tags_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
    );
    CREATE UNIQUE INDEX uq_tags_name_lower ON tags (lower(name));

    CREATE TABLE reservation_recurrences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id uuid NOT NULL REFERENCES rooms(id),
      applicant_name varchar(100) NOT NULL,
      applicant_email varchar(255) NOT NULL,
      applicant_phone varchar(50),
      purpose varchar(500) NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      days_of_week varchar(50) NOT NULL,
      start_time time NOT NULL,
      end_time time NOT NULL,
      conflict_policy recurrence_conflict_policy NOT NULL,
      original_room_name varchar(100),
      tag_id uuid REFERENCES tags(id) ON DELETE SET NULL,
      created_by varchar(100),
      updated_by varchar(100),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT chk_recurrences_applicant_name_not_blank CHECK (length(trim(applicant_name)) > 0),
      CONSTRAINT chk_recurrences_applicant_email_not_blank CHECK (length(trim(applicant_email)) > 0),
      CONSTRAINT chk_recurrences_purpose_not_blank CHECK (length(trim(purpose)) > 0),
      CONSTRAINT chk_recurrences_date_range CHECK (start_date <= end_date),
      CONSTRAINT chk_recurrences_time_range CHECK (start_time < end_time),
      CONSTRAINT chk_recurrences_days_not_blank CHECK (length(trim(days_of_week)) > 0),
      CONSTRAINT chk_recurrences_time_precision CHECK (
        extract(second FROM start_time) = 0 AND extract(second FROM end_time) = 0
      ),
      CONSTRAINT chk_recurrences_time_increment CHECK (
        extract(minute FROM start_time)::integer % 5 = 0
        AND extract(minute FROM end_time)::integer % 5 = 0
      )
    );
    CREATE INDEX idx_recurrences_room_id ON reservation_recurrences (room_id);
    CREATE INDEX idx_recurrences_date_range ON reservation_recurrences (start_date, end_date);
    CREATE INDEX idx_recurrences_deleted_at ON reservation_recurrences (deleted_at);
    CREATE INDEX idx_recurrences_tag_id ON reservation_recurrences (tag_id);

    CREATE TABLE reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id uuid NOT NULL REFERENCES rooms(id),
      recurrence_id uuid REFERENCES reservation_recurrences(id),
      applicant_name varchar(100) NOT NULL,
      applicant_email varchar(255) NOT NULL,
      applicant_phone varchar(50),
      purpose varchar(500) NOT NULL,
      start_at timestamptz NOT NULL,
      end_at timestamptz NOT NULL,
      status reservation_status NOT NULL DEFAULT 'REQUESTED',
      source reservation_source NOT NULL,
      created_by_actor_type actor_type NOT NULL,
      created_by_actor_id varchar(255),
      updated_by_actor_type actor_type,
      updated_by_actor_id varchar(255),
      original_room_name varchar(100),
      cancel_password_hash varchar(255),
      recurrence_exception boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_reservations_applicant_name_not_blank CHECK (length(trim(applicant_name)) > 0),
      CONSTRAINT chk_reservations_applicant_email_not_blank CHECK (length(trim(applicant_email)) > 0),
      CONSTRAINT chk_reservations_purpose_not_blank CHECK (length(trim(purpose)) > 0),
      CONSTRAINT chk_reservations_time_range CHECK (start_at < end_at),
      CONSTRAINT chk_reservations_time_precision CHECK (
        date_trunc('minute', start_at) = start_at AND date_trunc('minute', end_at) = end_at
      ),
      CONSTRAINT chk_reservations_time_increment CHECK (
        extract(minute FROM start_at AT TIME ZONE 'Asia/Seoul')::integer % 5 = 0
        AND extract(minute FROM end_at AT TIME ZONE 'Asia/Seoul')::integer % 5 = 0
        AND mod(extract(epoch FROM (end_at - start_at))::integer, 300) = 0
      ),
      CONSTRAINT chk_public_password_hash CHECK (
        source <> 'PUBLIC_FORM' OR cancel_password_hash LIKE '$2%'
      ),
      CONSTRAINT ex_reservations_no_time_overlap
        EXCLUDE USING gist (
          room_id WITH =,
          tstzrange(start_at, end_at, '[)') WITH &&
        ) WHERE (status IN ('REQUESTED', 'CONFIRMED'))
    );
    CREATE INDEX idx_reservations_room_time ON reservations (room_id, start_at, end_at);
    CREATE INDEX idx_reservations_status ON reservations (status);
    CREATE INDEX idx_reservations_start_at ON reservations (start_at);
    CREATE INDEX idx_reservations_applicant_email ON reservations (applicant_email);
    CREATE INDEX idx_reservations_recurrence_id ON reservations (recurrence_id);

    CREATE FUNCTION enforce_reservation_time_policy()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      configured_min_minutes integer;
      configured_max_minutes integer;
      duration_seconds numeric;
      duration_minutes numeric;
    BEGIN
      IF TG_OP = 'UPDATE'
        AND NEW.start_at IS NOT DISTINCT FROM OLD.start_at
        AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at THEN
        RETURN NEW;
      END IF;

      SELECT min_reservation_minutes, max_reservation_minutes
      INTO configured_min_minutes, configured_max_minutes
      FROM operation_settings
      WHERE id = 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Operation settings are required for reservation time validation.'
          USING ERRCODE = '23514';
      END IF;

      duration_seconds := extract(epoch FROM (NEW.end_at - NEW.start_at));
      IF duration_seconds > 0 THEN
        duration_minutes := duration_seconds / 60;
        IF duration_minutes < configured_min_minutes OR duration_minutes > configured_max_minutes THEN
          RAISE EXCEPTION 'Reservation duration is outside the configured minimum and maximum.'
            USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END
    $function$;

    CREATE TRIGGER trg_reservations_time_policy
      BEFORE INSERT OR UPDATE ON reservations
      FOR EACH ROW EXECUTE FUNCTION enforce_reservation_time_policy();

    CREATE FUNCTION enforce_recurrence_time_policy()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      configured_min_minutes integer;
      configured_max_minutes integer;
      duration_minutes numeric;
    BEGIN
      IF TG_OP = 'UPDATE'
        AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
        AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time THEN
        RETURN NEW;
      END IF;

      SELECT min_reservation_minutes, max_reservation_minutes
      INTO configured_min_minutes, configured_max_minutes
      FROM operation_settings
      WHERE id = 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Operation settings are required for recurrence time validation.'
          USING ERRCODE = '23514';
      END IF;

      duration_minutes := extract(epoch FROM (NEW.end_time - NEW.start_time)) / 60;
      IF duration_minutes > 0
        AND (duration_minutes < configured_min_minutes OR duration_minutes > configured_max_minutes) THEN
        RAISE EXCEPTION 'Recurrence duration is outside the configured minimum and maximum.'
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END
    $function$;

    CREATE TRIGGER trg_recurrences_time_policy
      BEFORE INSERT OR UPDATE ON reservation_recurrences
      FOR EACH ROW EXECUTE FUNCTION enforce_recurrence_time_policy();

    CREATE TABLE reservation_histories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reservation_id uuid REFERENCES reservations(id),
      reservation_deleted_id uuid,
      action varchar(50) NOT NULL,
      before_status reservation_status,
      after_status reservation_status,
      memo text,
      actor_type actor_type NOT NULL,
      actor_id varchar(255),
      reservation_room_id uuid,
      before_reservation_room_id uuid,
      reservation_purpose varchar(500),
      before_reservation_purpose varchar(500),
      reservation_room_name varchar(100),
      before_reservation_room_name varchar(100),
      reservation_start_at timestamptz,
      before_reservation_start_at timestamptz,
      reservation_end_at timestamptz,
      before_reservation_end_at timestamptz,
      reservation_applicant_name varchar(100),
      before_reservation_applicant_name varchar(100),
      reservation_applicant_email varchar(255),
      before_reservation_applicant_email varchar(255),
      reservation_applicant_phone varchar(50),
      before_reservation_applicant_phone varchar(50),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_histories_action CHECK (action IN (
        'CREATED', 'CREATED_BY_ADMIN', 'UPDATED', 'APPROVED', 'CANCELLED',
        'DELETED', 'RECURRENCE_GENERATED', 'RECURRENCE_CANCELLED'
      ))
    );
    CREATE INDEX idx_histories_reservation_id ON reservation_histories (reservation_id);
    CREATE INDEX idx_histories_created_at ON reservation_histories (created_at);
    CREATE INDEX idx_histories_deleted_id ON reservation_histories (reservation_deleted_id);
    CREATE INDEX idx_histories_room_id ON reservation_histories (reservation_room_id);

    CREATE TABLE admin_sessions (
      session_id_hash varchar(100) PRIMARY KEY,
      csrf_token_hash varchar(100) NOT NULL,
      admin_username varchar(100),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_admin_sessions_expires_at ON admin_sessions (expires_at, session_id_hash);

    INSERT INTO operation_settings (
      id, organization_name, public_notice, reservation_enabled,
      reservation_disabled_message, semester_start_date, semester_end_date,
      open_time, close_time, available_days_of_week,
      min_reservation_minutes, max_reservation_minutes,
      admin_contact_email, admin_contact_phone, completion_message
    ) VALUES (
      1, 'Room Reservation', 'Please enter purpose and time accurately before reserving.', false,
      'Reservation is currently disabled.', current_date, current_date + interval '120 days',
      '09:00', '18:00', 'MON,TUE,WED,THU,FRI', 30, 240,
      'admin@example.edu', '', 'Reservation request has been submitted.'
    );

    INSERT INTO rooms (name, location, capacity, description, enabled, system_reserved)
    VALUES (
      '삭제된 공간', 'SYSTEM', 0,
      'System sentinel room for preserved reservation records.', false, true
    );
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE IF EXISTS admin_sessions;
    DROP TABLE IF EXISTS reservation_histories;
    DROP TABLE IF EXISTS reservations;
    DROP TABLE IF EXISTS reservation_recurrences;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS operation_settings;
    DROP TABLE IF EXISTS rooms;
    DROP FUNCTION IF EXISTS enforce_recurrence_time_policy();
    DROP FUNCTION IF EXISTS enforce_reservation_time_policy();
    DROP TYPE IF EXISTS actor_type;
    DROP TYPE IF EXISTS recurrence_conflict_policy;
    DROP TYPE IF EXISTS reservation_source;
    DROP TYPE IF EXISTS reservation_status;
  `);
}
