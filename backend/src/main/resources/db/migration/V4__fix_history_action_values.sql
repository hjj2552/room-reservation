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
  'RECURRENCE_GENERATED',
  'RECURRENCE_CANCELLED'
));

