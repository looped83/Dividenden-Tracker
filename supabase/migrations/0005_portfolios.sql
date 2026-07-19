-- Portfolio: optionale Depot-Gruppierung (DATA_MODEL.md §3.2).
create table portfolios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id),
  name        text not null check (length(trim(name)) between 1 and 100),
  note        text check (length(note) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, name)
);

alter table portfolios enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): kein DELETE (Soft Delete), kein
-- Zugriff fuer anon.
revoke all on portfolios from anon, authenticated;
grant select, insert, update on portfolios to authenticated;

create policy portfolios_select_own on portfolios
  for select
  to authenticated
  using (user_id = auth.uid());

create policy portfolios_insert_own on portfolios
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy portfolios_update_own on portfolios
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Kein DELETE: Soft Delete ausschliesslich ueber archived_at (Grundsatz 3).

create trigger trg_portfolios_enforce_user_id
  before insert or update on portfolios
  for each row execute function enforce_user_id();

create trigger trg_portfolios_updated_at
  before update on portfolios
  for each row execute function set_updated_at();

create trigger trg_portfolios_audit
  after insert or update on portfolios
  for each row execute function audit_row_change('portfolio');
