import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE reservations
      ADD COLUMN show_applicant_name boolean NOT NULL DEFAULT false,
      ADD CONSTRAINT chk_reservations_public_applicant_name_hidden CHECK (
        source <> 'PUBLIC_FORM' OR show_applicant_name = false
      );

    ALTER TABLE reservation_recurrences
      ADD COLUMN show_applicant_name boolean NOT NULL DEFAULT false;

    ALTER TABLE reservation_histories
      ADD COLUMN reservation_show_applicant_name boolean,
      ADD COLUMN before_reservation_show_applicant_name boolean;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE reservation_histories
      DROP COLUMN before_reservation_show_applicant_name,
      DROP COLUMN reservation_show_applicant_name;

    ALTER TABLE reservation_recurrences
      DROP COLUMN show_applicant_name;

    ALTER TABLE reservations
      DROP CONSTRAINT chk_reservations_public_applicant_name_hidden,
      DROP COLUMN show_applicant_name;
  `);
}
