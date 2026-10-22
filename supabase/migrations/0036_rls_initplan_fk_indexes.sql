-- RLS-Policies und Fremdschlüssel-Indizes nach dem Supabase-Performance-
-- Advisor (Datenbank-Analyse 22.10.2026).
--
-- 1. `auth.uid()` in Policies steht jetzt als `(select auth.uid())`. So wertet
--    Postgres den Aufruf einmal je Abfrage aus (InitPlan) statt für jede Zeile
--    neu. Die Regeln selbst bleiben identisch: gleiche Rollen, Befehle und
--    Bedingungen. `alter policy` ändert nur den Ausdruck; Grants und
--    `enable row level security` bleiben unberührt (SECURITY_MODEL.md §2).
--
-- 2. Postgres prüft beim Löschen eines Assets oder Depots, ob noch Zahlungen
--    darauf zeigen. Die vorhandenen Indizes beginnen mit `user_id` und helfen
--    dabei nicht; die beiden neuen beginnen mit der Fremdschlüssel-Spalte.

alter policy anomaly_reviews_delete_own on anomaly_reviews using (user_id = (select auth.uid()));
alter policy anomaly_reviews_insert_own on anomaly_reviews with check (user_id = (select auth.uid()));
alter policy anomaly_reviews_select_own on anomaly_reviews using (user_id = (select auth.uid()));

alter policy audit_log_select_own on audit_log using (user_id = (select auth.uid()));

alter policy calendar_sync_status_select_own on calendar_sync_status using (user_id = (select auth.uid()));

alter policy depots_insert_own on depots with check (user_id = (select auth.uid()));
alter policy depots_select_own on depots using (user_id = (select auth.uid()));
alter policy depots_update_own on depots using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy dividend_calendar_events_select_own on dividend_calendar_events using (user_id = (select auth.uid()));

alter policy dividend_payments_delete_own on dividend_payments using (user_id = (select auth.uid()));
alter policy dividend_payments_insert_own on dividend_payments with check (user_id = (select auth.uid()));
alter policy dividend_payments_select_own on dividend_payments using (user_id = (select auth.uid()));
alter policy dividend_payments_update_own on dividend_payments using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy duplicate_dismissals_delete_own on duplicate_dismissals using (user_id = (select auth.uid()));
alter policy duplicate_dismissals_insert_own on duplicate_dismissals with check (user_id = (select auth.uid()));
alter policy duplicate_dismissals_select_own on duplicate_dismissals using (user_id = (select auth.uid()));

alter policy goals_delete_own on goals using (user_id = (select auth.uid()));
alter policy goals_insert_own on goals with check (user_id = (select auth.uid()));
alter policy goals_select_own on goals using (user_id = (select auth.uid()));
alter policy goals_update_own on goals using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy import_rows_insert_own on import_rows with check (user_id = (select auth.uid()));
alter policy import_rows_select_own on import_rows using (user_id = (select auth.uid()));

alter policy imports_insert_own on imports with check (user_id = (select auth.uid()));
alter policy imports_select_own on imports using (user_id = (select auth.uid()));
alter policy imports_update_own on imports using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy portfolios_insert_own on portfolios with check (user_id = (select auth.uid()));
alter policy portfolios_select_own on portfolios using (user_id = (select auth.uid()));
alter policy portfolios_update_own on portfolios using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy securities_insert_own on securities with check (user_id = (select auth.uid()));
alter policy securities_select_own on securities using (user_id = (select auth.uid()));
alter policy securities_update_own on securities using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy security_aliases_delete_own on security_aliases using (user_id = (select auth.uid()));
alter policy security_aliases_insert_own on security_aliases with check (user_id = (select auth.uid()));
alter policy security_aliases_select_own on security_aliases using (user_id = (select auth.uid()));

alter policy security_snapshot_runs_delete_own on security_snapshot_runs using (user_id = (select auth.uid()));
alter policy security_snapshot_runs_insert_own on security_snapshot_runs with check (user_id = (select auth.uid()));
alter policy security_snapshot_runs_select_own on security_snapshot_runs using (user_id = (select auth.uid()));

alter policy security_snapshots_delete_own on security_snapshots using (user_id = (select auth.uid()));
alter policy security_snapshots_insert_own on security_snapshots with check (user_id = (select auth.uid()));
alter policy security_snapshots_select_own on security_snapshots using (user_id = (select auth.uid()));

-- Sonderfälle mit zusätzlicher Bedingung bzw. `id` statt `user_id`.
alter policy imports_delete_draft_own on imports
  using (user_id = (select auth.uid())
         and status in ('analyzing', 'pending_confirmation', 'discarded'));
alter policy securities_delete_archived_own on securities
  using (user_id = (select auth.uid()) and archived_at is not null);
alter policy profiles_select_own on profiles using (id = (select auth.uid()));
alter policy profiles_update_own on profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create index if not exists dp_security_idx on dividend_payments (security_id);
create index if not exists dp_depot_idx on dividend_payments (depot_id);
