import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE operation_settings
      ADD COLUMN public_open_time time,
      ADD COLUMN public_close_time time,
      ADD COLUMN public_available_days_of_week varchar(50);

    UPDATE operation_settings
    SET public_open_time = open_time,
        public_close_time = close_time,
        public_available_days_of_week = available_days_of_week;

    ALTER TABLE operation_settings
      ALTER COLUMN public_open_time SET NOT NULL,
      ALTER COLUMN public_close_time SET NOT NULL,
      ALTER COLUMN public_available_days_of_week SET NOT NULL,
      ADD CONSTRAINT chk_operation_settings_public_time_range CHECK (
        open_time <= public_open_time
        AND public_open_time < public_close_time
        AND public_close_time <= close_time
      ),
      ADD CONSTRAINT chk_operation_settings_public_grid CHECK (
        extract(second FROM public_open_time) = 0
        AND extract(second FROM public_close_time) = 0
        AND extract(minute FROM public_open_time)::integer % 30 = 0
        AND extract(minute FROM public_close_time)::integer % 30 = 0
      ),
      ADD CONSTRAINT chk_operation_settings_public_min_minutes CHECK (
        min_reservation_minutes <= extract(epoch FROM (public_close_time - public_open_time)) / 60
      ),
      ADD CONSTRAINT chk_operation_settings_public_days_not_blank CHECK (
        length(trim(public_available_days_of_week)) > 0
      ),
      ADD CONSTRAINT chk_operation_settings_public_days_subset CHECK (
        string_to_array(public_available_days_of_week, ',') <@ string_to_array(available_days_of_week, ',')
      );
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE operation_settings
      DROP CONSTRAINT chk_operation_settings_public_days_subset,
      DROP CONSTRAINT chk_operation_settings_public_days_not_blank,
      DROP CONSTRAINT chk_operation_settings_public_min_minutes,
      DROP CONSTRAINT chk_operation_settings_public_grid,
      DROP CONSTRAINT chk_operation_settings_public_time_range,
      DROP COLUMN public_available_days_of_week,
      DROP COLUMN public_close_time,
      DROP COLUMN public_open_time;
  `);
}
