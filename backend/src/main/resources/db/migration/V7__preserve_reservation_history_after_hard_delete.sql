alter table reservation_histories
alter column reservation_id drop not null;

alter table reservation_histories
add column if not exists reservation_deleted_id uuid,
add column if not exists reservation_room_id uuid,
add column if not exists reservation_purpose varchar(500),
add column if not exists reservation_room_name varchar(100),
add column if not exists reservation_start_at timestamptz,
add column if not exists reservation_end_at timestamptz;

update reservation_histories
set reservation_deleted_id = reservation_id
where reservation_deleted_id is null;

create index if not exists idx_histories_reservation_deleted_id
on reservation_histories(reservation_deleted_id);

alter table reservation_histories
drop constraint if exists chk_histories_action_value;

alter table reservation_histories
add constraint chk_histories_action_value
check (action in (
  'CREATED',
  'CREATED_BY_ADMIN',
  'UPDATED',
  'APPROVED',
  'CANCELLED',
  'DELETED',
  'RECURRENCE_GENERATED',
  'RECURRENCE_CANCELLED'
));
