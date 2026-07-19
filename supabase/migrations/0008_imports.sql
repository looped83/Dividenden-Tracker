-- Import (DATA_MODEL.md §3.6). Fachliche Zeilenklassifikation, Bilanz und
-- Bericht liegen als jsonb vor (DECISIONS.md D-010).
create table imports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id),
  file_name        text not null,
  file_hash        char(64) not null,
  file_size_bytes  bigint not null check (file_size_bytes > 0),
  file_type        text not null check (file_type in ('csv', 'xlsx', 'xls')),
  sheet_name       text,
  status           import_status not null default 'analyzing',
  column_mapping   jsonb,
  detected_formats jsonb,
  row_balance      jsonb,
  row_report       jsonb,
  checksums        jsonb,
  created_at       timestamptz not null default now(),
  committed_at     timestamptz,
  rolled_back_at   timestamptz
);

create index imports_user_hash_idx on imports (user_id, file_hash);
create index imports_user_status_idx on imports (user_id, status);

alter table imports enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): DELETE nur fuer eigene Entwuerfe
-- (Policy unten), kein Zugriff fuer anon.
revoke all on imports from anon, authenticated;
grant select, insert, update, delete on imports to authenticated;

create policy imports_select_own on imports
  for select
  to authenticated
  using (user_id = auth.uid());

create policy imports_insert_own on imports
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy imports_update_own on imports
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Loeschen ist nur fuer abgebrochene/nicht bestaetigte Analysen erlaubt;
-- committed/rolled_back sind unloeschbare Historie (SECURITY_MODEL.md §3).
create policy imports_delete_draft_own on imports
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and status in ('analyzing', 'pending_confirmation', 'discarded')
  );

create trigger trg_imports_enforce_user_id
  before insert or update on imports
  for each row execute function enforce_user_id();

create trigger trg_imports_audit
  after insert or update on imports
  for each row execute function audit_row_change('import');
