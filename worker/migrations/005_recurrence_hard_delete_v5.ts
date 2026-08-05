import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_recurrences_deleted_at;

    ALTER TABLE reservation_recurrences
      DROP COLUMN deleted_at;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE reservation_recurrences
      ADD COLUMN deleted_at timestamptz;

    CREATE INDEX idx_recurrences_deleted_at
      ON reservation_recurrences (deleted_at);
  `);
}
