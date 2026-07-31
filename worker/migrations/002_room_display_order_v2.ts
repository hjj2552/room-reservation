import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE rooms ADD COLUMN display_order bigint;

    WITH ordered_rooms AS (
      SELECT id, row_number() OVER (ORDER BY name ASC, id ASC) AS next_order
      FROM rooms
      WHERE system_reserved = false AND deleted_at IS NULL
    )
    UPDATE rooms
    SET display_order = ordered_rooms.next_order
    FROM ordered_rooms
    WHERE rooms.id = ordered_rooms.id;

    UPDATE rooms
    SET display_order = NULL
    WHERE system_reserved = true;

    ALTER TABLE rooms
      ADD CONSTRAINT chk_rooms_display_order_target CHECK (
        (system_reserved = true AND display_order IS NULL)
        OR (
          system_reserved = false
          AND (
            deleted_at IS NOT NULL
            OR (display_order IS NOT NULL AND display_order > 0)
          )
        )
      );

    CREATE UNIQUE INDEX ux_rooms_display_order_active
      ON rooms (display_order)
      WHERE system_reserved = false AND deleted_at IS NULL;

    CREATE TABLE room_order_state (
      id smallint PRIMARY KEY,
      version bigint NOT NULL DEFAULT 0,
      CONSTRAINT chk_room_order_state_singleton CHECK (id = 1),
      CONSTRAINT chk_room_order_state_version_non_negative CHECK (version >= 0)
    );

    INSERT INTO room_order_state (id, version) VALUES (1, 0);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE IF EXISTS room_order_state;
    DROP INDEX IF EXISTS ux_rooms_display_order_active;
    ALTER TABLE rooms DROP CONSTRAINT IF EXISTS chk_rooms_display_order_target;
    ALTER TABLE rooms DROP COLUMN IF EXISTS display_order;
  `);
}
