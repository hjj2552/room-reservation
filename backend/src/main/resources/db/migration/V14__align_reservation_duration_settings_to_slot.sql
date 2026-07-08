alter table operation_settings
drop constraint if exists chk_operation_settings_min_minutes;

alter table operation_settings
drop constraint if exists chk_operation_settings_max_minutes;

alter table operation_settings
drop constraint if exists chk_operation_settings_time_slot_alignment;

alter table operation_settings
add constraint chk_operation_settings_min_minutes
check (
  min_reservation_minutes > 0
  and min_reservation_minutes % slot_minutes = 0
  and min_reservation_minutes <= extract(epoch from (close_time - open_time)) / 60
) not valid;

alter table operation_settings
add constraint chk_operation_settings_max_minutes
check (
  max_reservation_minutes >= min_reservation_minutes
  and max_reservation_minutes % slot_minutes = 0
) not valid;

alter table operation_settings
add constraint chk_operation_settings_time_slot_alignment
check (
  extract(minute from open_time)::integer % slot_minutes = 0
  and extract(minute from close_time)::integer % slot_minutes = 0
) not valid;
