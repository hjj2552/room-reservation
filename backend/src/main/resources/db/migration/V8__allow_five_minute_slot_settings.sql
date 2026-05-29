alter table operation_settings
  drop constraint chk_operation_settings_slot_minutes;

alter table operation_settings
  add constraint chk_operation_settings_slot_minutes
  check (slot_minutes in (5, 10, 15, 30, 60));
