import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE reservations
      ALTER COLUMN applicant_email DROP NOT NULL,
      DROP CONSTRAINT chk_reservations_applicant_email_not_blank,
      ADD CONSTRAINT chk_reservations_applicant_email_optional CHECK (
        applicant_email IS NULL OR length(trim(applicant_email)) > 0
      );

    ALTER TABLE reservation_recurrences
      ALTER COLUMN applicant_email DROP NOT NULL,
      DROP CONSTRAINT chk_recurrences_applicant_email_not_blank,
      ADD CONSTRAINT chk_recurrences_applicant_email_optional CHECK (
        applicant_email IS NULL OR length(trim(applicant_email)) > 0
      );
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE reservations
      DROP CONSTRAINT chk_reservations_applicant_email_optional,
      ADD CONSTRAINT chk_reservations_applicant_email_not_blank CHECK (
        length(trim(applicant_email)) > 0
      ),
      ALTER COLUMN applicant_email SET NOT NULL;

    ALTER TABLE reservation_recurrences
      DROP CONSTRAINT chk_recurrences_applicant_email_optional,
      ADD CONSTRAINT chk_recurrences_applicant_email_not_blank CHECK (
        length(trim(applicant_email)) > 0
      ),
      ALTER COLUMN applicant_email SET NOT NULL;
  `);
}
