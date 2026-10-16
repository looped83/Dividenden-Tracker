-- Audit Log (DATA_MODEL.md §3.8, SECURITY_MODEL.md §8): insert-only, wird
-- ausschliesslich von security-definer-Triggerfunktionen befuellt (0003).
-- Es gibt bewusst keine INSERT/UPDATE/DELETE-Policy: ohne passende Policy
-- ist die jeweilige Operation fuer alle RLS-unterworfenen Rollen gesperrt,
-- unabhaengig von Tabellen-Grants (Supabase-Konvention).
create table audit_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  entity_type text not null check (entity_type in
                ('dividend_payment', 'security', 'depot', 'portfolio', 'goal', 'import', 'profile')),
  entity_id   uuid not null,
  action      audit_action not null,
  old_values  jsonb,
  new_values  jsonb,
  origin      audit_origin not null,
  created_at  timestamptz not null default now()
);

create index audit_entity_idx on audit_log (user_id, entity_type, entity_id, created_at desc);

alter table audit_log enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): explizite, minimale Grants statt
-- Supabase-Standardgrants. audit_log ist insert-only per Trigger, daher hier
-- ausschliesslich SELECT fuer authenticated, kein Zugriff fuer anon.
revoke all on audit_log from anon, authenticated;
grant select on audit_log to authenticated;

create policy audit_log_select_own on audit_log
  for select
  to authenticated
  using (user_id = auth.uid());
