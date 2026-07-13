create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type reservation_status as enum (
  'REQUESTED',
  'CONFIRMED',
  'CANCELLED'
);

create type reservation_source as enum (
  'PUBLIC_FORM',
  'ADMIN_GRID',
  'ADMIN_MANUAL',
  'RECURRING_GENERATED'
);

create type recurrence_conflict_policy as enum (
  'SKIP_CONFLICTS',
  'FAIL_ALL'
);

create type actor_type as enum (
  'PUBLIC_USER',
  'ADMIN',
  'SYSTEM'
);

create type admin_role as enum (
  'SUPER_ADMIN',
  'OPERATOR'
);

create table admins (
  id uuid primary key default gen_random_uuid(),
  username varchar(100) not null,
  password_hash varchar(255) not null,
  display_name varchar(100) not null,
  role admin_role not null default 'OPERATOR',
  enabled boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references admins(id),
  updated_by uuid references admins(id),
  constraint uq_admins_username unique (username),
  constraint chk_admins_username_not_blank check (length(trim(username)) > 0),
  constraint chk_admins_display_name_not_blank check (length(trim(display_name)) > 0)
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  location varchar(150),
  capacity integer not null,
  description text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references admins(id),
  updated_by uuid references admins(id),
  system_reserved boolean not null default false,
  constraint chk_rooms_name_not_blank check (length(trim(name)) > 0),
  constraint chk_rooms_capacity_non_negative check (capacity >= 0)
);

create table operation_settings (
  id bigint primary key,
  organization_name varchar(150) not null,
  public_notice text,
  reservation_enabled boolean not null default true,
  reservation_disabled_message text,
  semester_start_date date not null,
  semester_end_date date not null,
  open_time time not null,
  close_time time not null,
  slot_minutes integer not null,
  available_days_of_week varchar(50) not null,
  min_reservation_minutes integer not null,
  max_reservation_minutes integer not null,
  admin_contact_email varchar(255),
  admin_contact_phone varchar(50),
  completion_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id),
  version bigint not null default 0,
  constraint chk_operation_settings_singleton check (id = 1),
  constraint chk_operation_settings_org_not_blank check (length(trim(organization_name)) > 0),
  constraint chk_operation_settings_semester_range check (semester_start_date <= semester_end_date),
  constraint chk_operation_settings_time_range check (open_time < close_time),
  constraint chk_operation_settings_slot_minutes check (slot_minutes in (5, 10, 15, 30, 60)),
  constraint chk_operation_settings_days_not_blank check (length(trim(available_days_of_week)) > 0)
);

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

create table tags (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  color varchar(20) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_tags_name_not_blank check (length(trim(name)) > 0),
  constraint chk_tags_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table reservation_recurrences (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  applicant_name varchar(100) not null,
  applicant_email varchar(255) not null,
  applicant_phone varchar(50),
  purpose varchar(500) not null,
  start_date date not null,
  end_date date not null,
  days_of_week varchar(50) not null,
  start_time time not null,
  end_time time not null,
  conflict_policy recurrence_conflict_policy not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references admins(id),
  updated_by uuid references admins(id),
  original_room_name varchar(100),
  tag_id uuid references tags(id) on delete set null,
  constraint chk_recurrences_applicant_name_not_blank check (length(trim(applicant_name)) > 0),
  constraint chk_recurrences_applicant_email_not_blank check (length(trim(applicant_email)) > 0),
  constraint chk_recurrences_purpose_not_blank check (length(trim(purpose)) > 0),
  constraint chk_recurrences_date_range check (start_date <= end_date),
  constraint chk_recurrences_time_range check (start_time < end_time),
  constraint chk_recurrences_days_not_blank check (length(trim(days_of_week)) > 0)
);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  recurrence_id uuid references reservation_recurrences(id),
  applicant_name varchar(100) not null,
  applicant_email varchar(255) not null,
  applicant_phone varchar(50),
  purpose varchar(500) not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status reservation_status not null default 'REQUESTED',
  source reservation_source not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_actor_type actor_type not null,
  created_by_actor_id varchar(100),
  updated_by_actor_type actor_type,
  updated_by_actor_id varchar(100),
  original_room_name varchar(100),
  cancel_password_hash varchar(255),
  recurrence_exception boolean not null default false,
  constraint chk_reservations_applicant_name_not_blank check (length(trim(applicant_name)) > 0),
  constraint chk_reservations_applicant_email_not_blank check (length(trim(applicant_email)) > 0),
  constraint chk_reservations_purpose_not_blank check (length(trim(purpose)) > 0),
  constraint chk_reservations_time_range check (start_at < end_at)
);

alter table reservations
add constraint ex_reservations_no_time_overlap
exclude using gist (
  room_id with =,
  tstzrange(start_at, end_at, '[)') with &&
)
where (status in ('REQUESTED', 'CONFIRMED'));

create table reservation_histories (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references reservations(id),
  action varchar(50) not null,
  before_status reservation_status,
  after_status reservation_status,
  memo text,
  actor_type actor_type not null,
  actor_id varchar(100),
  created_at timestamptz not null default now(),
  reservation_deleted_id uuid,
  reservation_room_id uuid,
  reservation_purpose varchar(500),
  reservation_room_name varchar(100),
  reservation_start_at timestamptz,
  reservation_end_at timestamptz,
  before_reservation_room_id uuid,
  before_reservation_room_name varchar(100),
  before_reservation_purpose varchar(500),
  before_reservation_start_at timestamptz,
  before_reservation_end_at timestamptz,
  before_reservation_applicant_name varchar(100),
  before_reservation_applicant_email varchar(255),
  before_reservation_applicant_phone varchar(50),
  reservation_applicant_name varchar(100),
  reservation_applicant_email varchar(255),
  reservation_applicant_phone varchar(50),
  constraint chk_histories_action_not_blank check (length(trim(action)) > 0),
  constraint chk_histories_action_value check (action in (
    'CREATED',
    'CREATED_BY_ADMIN',
    'UPDATED',
    'APPROVED',
    'CANCELLED',
    'DELETED',
    'RECURRENCE_GENERATED',
    'RECURRENCE_CANCELLED'
  ))
);

create index idx_admins_enabled on admins(enabled);
create index idx_admins_deleted_at on admins(deleted_at);

create index idx_rooms_enabled on rooms(enabled);
create index idx_rooms_deleted_at on rooms(deleted_at);
create unique index ux_rooms_name_active
on rooms (name)
where deleted_at is null;
create unique index ux_rooms_single_system_reserved
on rooms (system_reserved)
where system_reserved = true and deleted_at is null;

create unique index uq_tags_name_lower on tags (lower(name));

create index idx_recurrences_room_id on reservation_recurrences(room_id);
create index idx_recurrences_date_range on reservation_recurrences(start_date, end_date);
create index idx_recurrences_deleted_at on reservation_recurrences(deleted_at);
create index idx_recurrences_tag_id on reservation_recurrences(tag_id);

create index idx_reservations_room_time on reservations(room_id, start_at, end_at);
create index idx_reservations_status on reservations(status);
create index idx_reservations_start_at on reservations(start_at);
create index idx_reservations_applicant_email on reservations(applicant_email);
create index idx_reservations_recurrence_id on reservations(recurrence_id);

create index idx_histories_reservation_id on reservation_histories(reservation_id);
create index idx_histories_created_at on reservation_histories(created_at);
create index idx_histories_reservation_deleted_id on reservation_histories(reservation_deleted_id);

insert into operation_settings (
  id,
  organization_name,
  public_notice,
  reservation_enabled,
  reservation_disabled_message,
  semester_start_date,
  semester_end_date,
  open_time,
  close_time,
  slot_minutes,
  available_days_of_week,
  min_reservation_minutes,
  max_reservation_minutes,
  admin_contact_email,
  admin_contact_phone,
  completion_message
) values (
  1,
  'Room Reservation',
  'Please enter purpose and time accurately before reserving.',
  true,
  'Reservation is currently disabled.',
  current_date,
  current_date + interval '120 days',
  '09:00',
  '18:00',
  30,
  'MON,TUE,WED,THU,FRI',
  30,
  240,
  'admin@example.edu',
  '',
  'Reservation request has been submitted.'
);

insert into rooms (
  name,
  location,
  capacity,
  description,
  enabled,
  system_reserved
) values (
  '(삭제된 강의실)',
  'SYSTEM',
  0,
  'System sentinel room for preserved reservation records.',
  false,
  true
);
