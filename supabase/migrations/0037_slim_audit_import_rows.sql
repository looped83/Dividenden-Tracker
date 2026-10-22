-- Datenbank verschlanken (ADR-008, 22.10.2026).
--
-- 1. Kein Audit Log mehr: Die Änderungshistorie wird nicht gebraucht. Die
--    Trigger entfallen, die Tabelle wird geleert. Tabelle, Policy und
--    `audit_row_change()` bleiben vorerst stehen, damit ältere
--    Datensicherungen (optionales Feld `audit_log`) und das Schema stabil
--    bleiben; ein neuer Trigger reicht, um das Protokoll wieder einzuschalten.
--
-- 2. Die Rohzeilen abgeschlossener Importe (`import_rows`) werden geleert.
--    Keine Tabelle verweist auf sie; `commit_import` legt sie bei einem
--    künftigen Import wieder an.
--
-- 3. Indizes, die nur der CSV-Import oder das Löschen eines Importentwurfs
--    nutzt, entfallen. Bei den Datenmengen eines Privatdepots ist ein
--    sequenzieller Scan dort schnell genug. Eindeutigkeitsregeln bleiben.
--    `dp_user_depot_idx` ist seit 0036 durch `dp_depot_idx` abgedeckt.

drop trigger if exists trg_profiles_audit on profiles;
drop trigger if exists trg_portfolios_audit on portfolios;
drop trigger if exists trg_depots_audit on depots;
drop trigger if exists trg_securities_audit on securities;
drop trigger if exists trg_imports_audit on imports;
drop trigger if exists trg_dividend_payments_audit on dividend_payments;
drop trigger if exists trg_goals_audit on goals;

truncate table audit_log;
truncate table import_rows;

drop index if exists dp_business_fp_idx;
drop index if exists dp_row_fp_idx;
drop index if exists dp_user_depot_idx;
drop index if exists dp_user_import_idx;
drop index if exists imports_user_hash_idx;
drop index if exists securities_created_by_import_idx;
drop index if exists depots_created_by_import_idx;
drop index if exists security_aliases_source_import_idx;
