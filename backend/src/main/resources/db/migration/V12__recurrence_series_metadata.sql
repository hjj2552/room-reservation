alter table reservation_recurrences
add column series_label varchar(100),
add column series_color varchar(20);

alter table reservations
add column recurrence_exception boolean not null default false;

alter type recurrence_conflict_policy rename to recurrence_conflict_policy_old;

create type recurrence_conflict_policy as enum (
  'SKIP_CONFLICTS',
  'FAIL_ALL'
);

alter table reservation_recurrences
alter column conflict_policy type recurrence_conflict_policy
using (
  case conflict_policy::text
    when 'CREATE_AVAILABLE_ONLY' then 'SKIP_CONFLICTS'
    else conflict_policy::text
  end
)::recurrence_conflict_policy;

drop type recurrence_conflict_policy_old;

alter table reservation_recurrences
add constraint chk_recurrences_series_color_hex
check (series_color is null or series_color ~ '^#[0-9A-Fa-f]{6}$');
