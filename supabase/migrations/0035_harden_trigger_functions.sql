-- Härtung der Trigger-Funktionen nach dem Supabase-Sicherheitsadvisor
-- (Sicherheitscheck 22.10.2026, SECURITY_MODEL.md §3 Punkt 7).
--
-- 1. Fester search_path: Ohne ihn erben die Funktionen den Pfad des
--    jeweiligen Aufrufers (vgl. 0015). Alle Bezüge zeigen auf `public`,
--    `auth.uid()` ist voll qualifiziert.
--
-- 2. Kein EXECUTE für Clients: Supabase vergibt EXECUTE auf neue Funktionen
--    automatisch an anon und authenticated, wodurch jede Funktion in `public`
--    unter /rest/v1/rpc/… erreichbar ist. Trigger-Funktionen ruft niemand
--    direkt auf; Postgres prüft EXECUTE nur beim Anlegen des Triggers, nicht
--    beim Auslösen. Die Trigger feuern also unverändert weiter.

alter function set_updated_at() set search_path = public;
alter function enforce_user_id() set search_path = public;
alter function protect_payment_immutables() set search_path = public;
alter function guard_base_currency_change() set search_path = public;
alter function guard_import_status() set search_path = public;
alter function enforce_own_security() set search_path = public;
alter function enforce_own_depot() set search_path = public;

revoke execute on function audit_row_change() from public, anon, authenticated;
revoke execute on function handle_new_user() from public, anon, authenticated;

-- rls_auto_enable ist die Event-Trigger-Funktion, die Supabase für
-- „RLS automatisch aktivieren“ anlegt. Sie stammt nicht aus diesen
-- Migrationen und fehlt in der lokalen Testdatenbank.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
