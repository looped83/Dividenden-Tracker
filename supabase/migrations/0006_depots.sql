-- Depot (DATA_MODEL.md §3.3).
create table depots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id),
  portfolio_id  uuid references portfolios (id),
  name          text not null check (length(trim(name)) between 1 and 100),
  broker        text check (length(broker) <= 100),
  base_currency char(3) not null default 'EUR' check (base_currency ~ '^[A-Z]{3}$'),
  note          text check (length(note) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  unique (user_id, name)
);

create index depots_user_portfolio_idx on depots (user_id, portfolio_id);

alter table depots enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): kein DELETE (Soft Delete), kein
-- Zugriff fuer anon.
revoke all on depots from anon, authenticated;
grant select, insert, update on depots to authenticated;

create policy depots_select_own on depots
  for select
  to authenticated
  using (user_id = auth.uid());

create policy depots_insert_own on depots
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy depots_update_own on depots
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger trg_depots_enforce_user_id
  before insert or update on depots
  for each row execute function enforce_user_id();

create trigger trg_depots_updated_at
  before update on depots
  for each row execute function set_updated_at();

create trigger trg_depots_audit
  after insert or update on depots
  for each row execute function audit_row_change('depot');
