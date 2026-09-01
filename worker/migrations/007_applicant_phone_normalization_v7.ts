import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM (
          SELECT applicant_phone AS phone FROM reservations WHERE applicant_phone IS NOT NULL
          UNION ALL
          SELECT applicant_phone FROM reservation_recurrences WHERE applicant_phone IS NOT NULL
          UNION ALL
          SELECT reservation_applicant_phone FROM reservation_histories
            WHERE reservation_applicant_phone IS NOT NULL
          UNION ALL
          SELECT before_reservation_applicant_phone FROM reservation_histories
            WHERE before_reservation_applicant_phone IS NOT NULL
        ) applicant_phones
        WHERE phone !~ '^[0-9 -]+$'
           OR regexp_replace(phone, '[- ]', '', 'g') = ''
      ) THEN
        RAISE EXCEPTION 'Applicant phone migration rejected invalid legacy data.'
          USING ERRCODE = '23514';
      END IF;
    END
    $$;

    UPDATE reservations
    SET applicant_phone = regexp_replace(applicant_phone, '[- ]', '', 'g')
    WHERE applicant_phone IS NOT NULL;

    UPDATE reservation_recurrences
    SET applicant_phone = regexp_replace(applicant_phone, '[- ]', '', 'g')
    WHERE applicant_phone IS NOT NULL;

    UPDATE reservation_histories
    SET reservation_applicant_phone = regexp_replace(reservation_applicant_phone, '[- ]', '', 'g'),
        before_reservation_applicant_phone = regexp_replace(before_reservation_applicant_phone, '[- ]', '', 'g')
    WHERE reservation_applicant_phone IS NOT NULL
       OR before_reservation_applicant_phone IS NOT NULL;

    ALTER TABLE reservations
      ADD CONSTRAINT chk_reservations_applicant_phone_digits
      CHECK (applicant_phone IS NULL OR applicant_phone ~ '^[0-9]+$');

    ALTER TABLE reservation_recurrences
      ADD CONSTRAINT chk_recurrences_applicant_phone_digits
      CHECK (applicant_phone IS NULL OR applicant_phone ~ '^[0-9]+$');

    ALTER TABLE reservation_histories
      ADD CONSTRAINT chk_histories_reservation_applicant_phone_digits
        CHECK (reservation_applicant_phone IS NULL OR reservation_applicant_phone ~ '^[0-9]+$'),
      ADD CONSTRAINT chk_histories_before_reservation_applicant_phone_digits
        CHECK (before_reservation_applicant_phone IS NULL OR before_reservation_applicant_phone ~ '^[0-9]+$');
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE reservation_histories
      DROP CONSTRAINT chk_histories_before_reservation_applicant_phone_digits,
      DROP CONSTRAINT chk_histories_reservation_applicant_phone_digits;
    ALTER TABLE reservation_recurrences
      DROP CONSTRAINT chk_recurrences_applicant_phone_digits;
    ALTER TABLE reservations
      DROP CONSTRAINT chk_reservations_applicant_phone_digits;
  `);
}
