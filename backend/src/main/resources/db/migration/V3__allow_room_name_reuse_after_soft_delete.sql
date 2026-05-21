alter table rooms
drop constraint if exists uq_rooms_name;

create unique index if not exists ux_rooms_name_active
on rooms (name)
where deleted_at is null;

