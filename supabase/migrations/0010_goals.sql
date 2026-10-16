-- Ziel (DATA_MODEL.md §3.7). Vollstaendig getrennt von Zahlungsdaten
-- (Grundsatz 8) — keine Fremdschluessel auf dividend_payments.
create table goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id),
  goal_type     goal_type not null,
  year          int check (year between 1990 and 2100),
  target_year   int check (target_year between 1990 and 2100),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  currency      char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  note          text check (length(note) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  constraint goal_year_consistency check (
    (goal_type in ('net_year', 'gross_year') and year is not null and target_year is null)
    or (goal_type = 'long_term' and target_year is not null and year is null)
    or (goal_type in ('rolling_12m', 'avg_month_net') and year is null and target_year is null)
  )
);

create unique index goals_unique_active on goals (user_id, goal_type, coalesce(year, 0))
  where archived_at is null;

alter table goals enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): kein DELETE (Soft Delete), kein
-- Zugriff fuer anon.
revoke all on goals from anon, authenticated;
grant select, insert, update on goals to authenticated;

create policy goals_select_own on goals
  for select
  to authenticated
  using (user_id = auth.uid());

create policy goals_insert_own on goals
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy goals_update_own on goals
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger trg_goals_enforce_user_id
  before insert or update on goals
  for each row execute function enforce_user_id();

create trigger trg_goals_updated_at
  before update on goals
  for each row execute function set_updated_at();

create trigger trg_goals_audit
  after insert or update on goals
  for each row execute function audit_row_change('goal');
