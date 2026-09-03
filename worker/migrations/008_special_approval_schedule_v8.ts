import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE operation_settings
      DROP CONSTRAINT chk_operation_settings_public_days_subset,
      DROP CONSTRAINT chk_operation_settings_public_days_not_blank,
      DROP CONSTRAINT chk_operation_settings_public_min_minutes,
      DROP CONSTRAINT chk_operation_settings_public_grid,
      DROP CONSTRAINT chk_operation_settings_public_time_range,
      ADD COLUMN special_approval_start_time time NOT NULL DEFAULT '18:00',
      ADD COLUMN special_approval_end_time time NOT NULL DEFAULT '21:00',
      ADD COLUMN special_approval_days_of_week varchar(50) NOT NULL DEFAULT 'SAT,SUN';

    UPDATE operation_settings
    SET open_time = '09:00',
        close_time = '21:00',
        available_days_of_week = 'MON,TUE,WED,THU,FRI,SAT,SUN',
        public_open_time = '09:00',
        public_close_time = '21:00',
        public_available_days_of_week = 'MON,TUE,WED,THU,FRI,SAT,SUN',
        special_approval_start_time = '18:00',
        special_approval_end_time = '21:00',
        special_approval_days_of_week = 'SAT,SUN'
    WHERE id = 1;

    ALTER TABLE operation_settings
      ADD CONSTRAINT chk_operation_settings_special_approval_time_range CHECK (
        open_time <= special_approval_start_time
        AND special_approval_start_time < special_approval_end_time
        AND special_approval_end_time <= close_time
      ),
      ADD CONSTRAINT chk_operation_settings_special_approval_grid CHECK (
        extract(second FROM special_approval_start_time) = 0
        AND extract(second FROM special_approval_end_time) = 0
        AND extract(minute FROM special_approval_start_time)::integer % 30 = 0
        AND extract(minute FROM special_approval_end_time)::integer % 30 = 0
      ),
      ADD CONSTRAINT chk_operation_settings_special_approval_days_subset CHECK (
        string_to_array(special_approval_days_of_week, ',') <@ string_to_array(available_days_of_week, ',')
      );
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE operation_settings
      DROP CONSTRAINT chk_operation_settings_special_approval_days_subset,
      DROP CONSTRAINT chk_operation_settings_special_approval_grid,
      DROP CONSTRAINT chk_operation_settings_special_approval_time_range,
      DROP COLUMN special_approval_days_of_week,
      DROP COLUMN special_approval_end_time,
      DROP COLUMN special_approval_start_time;

    UPDATE operation_settings
    SET public_open_time = open_time,
        public_close_time = close_time,
        public_available_days_of_week = available_days_of_week;

    ALTER TABLE operation_settings
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
