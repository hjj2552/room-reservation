do $$
begin
  if exists (
    select 1
    from operation_settings
    where slot_minutes = 60
  ) then
    raise exception
      'Cannot apply reservation time policy migration while operation_settings.slot_minutes is 60. Choose 5, 10, 15, or 30 before deployment.'
      using errcode = '23514';
  end if;
end
$$;

alter table operation_settings
drop constraint if exists chk_operation_settings_slot_minutes;

alter table operation_settings
drop constraint if exists chk_operation_settings_min_minutes;

alter table operation_settings
drop constraint if exists chk_operation_settings_max_minutes;

alter table operation_settings
drop constraint if exists chk_operation_settings_time_slot_alignment;

alter table operation_settings
add constraint chk_operation_settings_slot_minutes
check (slot_minutes in (5, 10, 15, 30));

alter table operation_settings
add constraint chk_operation_settings_min_minutes
check (
  min_reservation_minutes > 0
  and min_reservation_minutes % slot_minutes = 0
  and min_reservation_minutes <= extract(epoch from (close_time - open_time)) / 60
);

alter table operation_settings
add constraint chk_operation_settings_max_minutes
check (
  max_reservation_minutes >= greatest(30, min_reservation_minutes)
  and max_reservation_minutes % slot_minutes = 0
);

alter table operation_settings
add constraint chk_operation_settings_time_grid_alignment
check (
  extract(minute from open_time)::integer % 30 = 0
  and extract(minute from close_time)::integer % 30 = 0
);

alter table operation_settings
add constraint chk_operation_settings_time_precision
check (
  extract(second from open_time) = 0
  and extract(second from close_time) = 0
);

create or replace function enforce_reservation_time_policy()
returns trigger
language plpgsql
as $$
declare
  configured_slot_minutes integer;
  configured_min_minutes integer;
  configured_max_minutes integer;
  duration_seconds numeric;
  duration_minutes numeric;
begin
  if tg_op = 'UPDATE'
    and new.start_at is not distinct from old.start_at
    and new.end_at is not distinct from old.end_at then
    return new;
  end if;

  select slot_minutes, min_reservation_minutes, max_reservation_minutes
  into configured_slot_minutes, configured_min_minutes, configured_max_minutes
  from operation_settings
  where id = 1;

  if not found then
    raise exception 'Operation settings are required for reservation time validation.'
      using errcode = '23514';
  end if;

  if extract(second from new.start_at) <> 0
    or extract(second from new.end_at) <> 0 then
    raise exception 'Reservation start and end times must not include seconds or fractional seconds.'
      using errcode = '23514';
  end if;

  if extract(minute from new.start_at at time zone 'Asia/Seoul')::integer % configured_slot_minutes <> 0
    or extract(minute from new.end_at at time zone 'Asia/Seoul')::integer % configured_slot_minutes <> 0 then
    raise exception 'Reservation start and end times must match the configured slot unit.'
      using errcode = '23514';
  end if;

  duration_seconds := extract(epoch from (new.end_at - new.start_at));
  if duration_seconds > 0 then
    duration_minutes := duration_seconds / 60;
    if mod(duration_seconds, configured_slot_minutes * 60) <> 0 then
      raise exception 'Reservation duration must match the configured slot unit.'
        using errcode = '23514';
    end if;
    if duration_minutes < configured_min_minutes or duration_minutes > configured_max_minutes then
      raise exception 'Reservation duration is outside the configured minimum and maximum.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

create trigger trg_reservations_time_policy
before insert or update on reservations
for each row
execute function enforce_reservation_time_policy();

create or replace function enforce_recurrence_time_policy()
returns trigger
language plpgsql
as $$
declare
  configured_slot_minutes integer;
  configured_min_minutes integer;
  configured_max_minutes integer;
  duration_seconds numeric;
  duration_minutes numeric;
begin
  if tg_op = 'UPDATE'
    and new.start_time is not distinct from old.start_time
    and new.end_time is not distinct from old.end_time then
    return new;
  end if;

  select slot_minutes, min_reservation_minutes, max_reservation_minutes
  into configured_slot_minutes, configured_min_minutes, configured_max_minutes
  from operation_settings
  where id = 1;

  if not found then
    raise exception 'Operation settings are required for recurrence time validation.'
      using errcode = '23514';
  end if;

  if extract(second from new.start_time) <> 0
    or extract(second from new.end_time) <> 0 then
    raise exception 'Recurrence start and end times must not include seconds or fractional seconds.'
      using errcode = '23514';
  end if;

  if extract(minute from new.start_time)::integer % configured_slot_minutes <> 0
    or extract(minute from new.end_time)::integer % configured_slot_minutes <> 0 then
    raise exception 'Recurrence start and end times must match the configured slot unit.'
      using errcode = '23514';
  end if;

  duration_seconds := extract(epoch from (new.end_time - new.start_time));
  if duration_seconds > 0 then
    duration_minutes := duration_seconds / 60;
    if mod(duration_seconds, configured_slot_minutes * 60) <> 0 then
      raise exception 'Recurrence duration must match the configured slot unit.'
        using errcode = '23514';
    end if;
    if duration_minutes < configured_min_minutes or duration_minutes > configured_max_minutes then
      raise exception 'Recurrence duration is outside the configured minimum and maximum.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

create trigger trg_recurrences_time_policy
before insert or update on reservation_recurrences
for each row
execute function enforce_recurrence_time_policy();
