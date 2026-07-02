create table tags (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  color varchar(20) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_tags_name_not_blank check (length(trim(name)) > 0),
  constraint chk_tags_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index uq_tags_name_lower on tags (lower(name));

alter table reservation_recurrences
drop constraint if exists chk_recurrences_series_color_hex,
drop column if exists series_label,
drop column if exists series_color,
add column tag_id uuid references tags(id) on delete set null;

create index idx_recurrences_tag_id on reservation_recurrences(tag_id);
