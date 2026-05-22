alter table rooms
add column if not exists system_reserved boolean not null default false;

alter table reservations
add column if not exists original_room_name varchar(100);

alter table reservation_recurrences
add column if not exists original_room_name varchar(100);

insert into rooms (name, location, capacity, description, enabled, system_reserved)
select '(삭제된 강의실)', 'SYSTEM', 0, 'System sentinel room for preserved reservation records.', false, true
where not exists (
  select 1
  from rooms
  where system_reserved = true
);

create unique index if not exists ux_rooms_single_system_reserved
on rooms (system_reserved)
where system_reserved = true and deleted_at is null;
