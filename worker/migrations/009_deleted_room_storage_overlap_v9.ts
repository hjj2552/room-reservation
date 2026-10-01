import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    LOCK TABLE rooms, reservations IN ACCESS EXCLUSIVE MODE;
    ALTER TABLE rooms ADD CONSTRAINT uq_rooms_id_system_reserved UNIQUE (id, system_reserved);
    ALTER TABLE reservations ADD COLUMN room_system_reserved boolean NOT NULL DEFAULT false;

    UPDATE reservations r SET room_system_reserved = rm.system_reserved
    FROM rooms rm WHERE rm.id = r.room_id AND rm.system_reserved;

    ALTER TABLE reservations ADD CONSTRAINT fk_reservations_room_system_reserved
      FOREIGN KEY (room_id, room_system_reserved) REFERENCES rooms (id, system_reserved)
      ON UPDATE CASCADE;

    CREATE FUNCTION set_reservation_room_system_reserved()
    RETURNS trigger LANGUAGE plpgsql AS $function$
    BEGIN
      SELECT system_reserved INTO NEW.room_system_reserved FROM rooms WHERE id = NEW.room_id;
      RETURN NEW;
    END;
    $function$;
    CREATE TRIGGER trg_reservations_room_system_reserved
      BEFORE INSERT OR UPDATE OF room_id ON reservations
      FOR EACH ROW EXECUTE FUNCTION set_reservation_room_system_reserved();

    ALTER TABLE reservations DROP CONSTRAINT ex_reservations_no_time_overlap;
    ALTER TABLE reservations ADD CONSTRAINT ex_reservations_no_time_overlap
      EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      ) WHERE (room_system_reserved = false AND status IN ('REQUESTED', 'CONFIRMED'));
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    LOCK TABLE rooms, reservations IN ACCESS EXCLUSIVE MODE;
    ALTER TABLE reservations DROP CONSTRAINT ex_reservations_no_time_overlap;
    -- Fails atomically if preserved reservations overlap; never discard or cancel them.
    ALTER TABLE reservations ADD CONSTRAINT ex_reservations_no_time_overlap
      EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      ) WHERE (status IN ('REQUESTED', 'CONFIRMED'));
    DROP TRIGGER trg_reservations_room_system_reserved ON reservations;
    DROP FUNCTION set_reservation_room_system_reserved();
    ALTER TABLE reservations DROP CONSTRAINT fk_reservations_room_system_reserved,
      DROP COLUMN room_system_reserved;
    ALTER TABLE rooms DROP CONSTRAINT uq_rooms_id_system_reserved;
  `);
}
