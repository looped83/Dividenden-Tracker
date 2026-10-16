-- Wertpapier/Unternehmen (DATA_MODEL.md §3.4).
create table securities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id),
  name          text not null check (length(trim(name)) between 1 and 200),
  ticker        text check (ticker ~ '^[A-Z0-9 .\-]{1,20}$'),
  isin          char(12) check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  wkn           char(6) check (wkn ~ '^[A-Z0-9]{6}$'),
  country       char(2) check (country ~ '^[A-Z]{2}$'),
  sector        text check (length(sector) <= 100),
  currency      char(3) check (currency ~ '^[A-Z]{3}$'),
  note          text check (length(note) <= 5000),
  data_quality  data_quality not null default 'ok',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);

create unique index securities_user_isin_key on securities (user_id, isin)
  where isin is not null and archived_at is null;

create unique index securities_user_name_key on securities (user_id, lower(name))
  where archived_at is null;

alter table securities enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): kein DELETE (Soft Delete), kein
-- Zugriff fuer anon.
revoke all on securities from anon, authenticated;
grant select, insert, update on securities to authenticated;

create policy securities_select_own on securities
  for select
  to authenticated
  using (user_id = auth.uid());

create policy securities_insert_own on securities
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy securities_update_own on securities
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger trg_securities_enforce_user_id
  before insert or update on securities
  for each row execute function enforce_user_id();

create trigger trg_securities_updated_at
  before update on securities
  for each row execute function set_updated_at();

create trigger trg_securities_audit
  after insert or update on securities
  for each row execute function audit_row_change('security');
