-- Phase 7 — Ziele und Fortschritt.
--
-- Die in 0010 angelegte `goals`-Tabelle war eine spekulative Vorstufe (nur eine
-- Platzhalterseite, keine UI, keine produktiven Daten) mit Zielarten, die Phase 7
-- ausdruecklich NICHT umsetzt (long_term, rolling_12m, avg_month_net). Phase 7
-- definiert die verbindlichen Zielarten `annual` (Jahresziel) und `monthly`
-- (Monatsziel). Da keinerlei Zieldaten existieren, wird die Tabelle samt Enum
-- sauber neu aufgebaut, statt eine zweite parallele Struktur einzufuehren
-- (Auftrag §5: „Erzeuge keine parallele zweite Berechnungslogik").
--
-- Ziele referenzieren weiterhin KEINE Zahlungsdaten (strikte Trennung Ist/Ziel,
-- Grundsatz 8). Der Fortschritt wird ausschliesslich aus den tatsaechlichen,
-- gueltigen Dividendeneingaengen abgeleitet — nie gespeichert.

-- Alte Struktur entfernen (Trigger/Policies/Index haengen an der Tabelle).
drop table if exists goals cascade;
drop type if exists goal_type;

-- Zwei klar definierte Zielarten. Die Architektur erlaubt spaeter weitere Werte
-- (z. B. Quartalsziele), ohne dass sie jetzt umgesetzt werden.
create type goal_type as enum ('annual', 'monthly');

-- Ziel (DATA_MODEL.md §3.7): schlank, normalisiert, decimal-sichere Betraege.
create table goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id),
  goal_type     goal_type not null,
  -- Kalenderjahr des Zielzeitraums; verpflichtend fuer beide Zielarten.
  year          int not null check (year between 1990 and 2100),
  -- Kalendermonat 1..12 nur bei Monatszielen; bei Jahreszielen null.
  month         int check (month between 1 and 12),
  target_amount numeric(14, 2) not null check (target_amount > 0 and target_amount < 1e12),
  currency      char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  title         text check (length(title) <= 200),
  note          text check (length(note) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Monat und Zielart muessen zueinander passen (Grundsatz: kein Monat bei
  -- Jahreszielen, zwingend ein Monat bei Monatszielen).
  constraint goal_month_consistency check (
    (goal_type = 'annual' and month is null)
    or (goal_type = 'monthly' and month is not null)
  )
);

-- Eindeutigkeit des Zielzeitraums (Auftrag §21): pro Nutzer hoechstens ein
-- Jahresziel je Jahr und hoechstens ein Monatsziel je Jahr+Monat. `coalesce`
-- gibt Jahreszielen den Monatsschluessel 0; Jahres- und Monatsziel desselben
-- Jahres kollidieren dadurch nie (Monatsziele nutzen 1..12).
create unique index goals_unique_period
  on goals (user_id, goal_type, year, coalesce(month, 0));

-- Schneller Zugriff auf die Ziele eines Nutzers, chronologisch.
create index goals_user_period_idx on goals (user_id, year, month);

alter table goals enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): kein Zugriff fuer anon. Anders als
-- Zahlungen duerfen Ziele direkt und dauerhaft geloescht werden (Auftrag §23) —
-- daher explizites DELETE-Grant und eine DELETE-Policy auf eigene Zeilen.
revoke all on goals from anon, authenticated;
grant select, insert, update, delete on goals to authenticated;

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

create policy goals_delete_own on goals
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Defense in Depth: user_id = auth.uid() erzwingen, Eigentuemer unveraenderlich.
create trigger trg_goals_enforce_user_id
  before insert or update on goals
  for each row execute function enforce_user_id();

create trigger trg_goals_updated_at
  before update on goals
  for each row execute function set_updated_at();

-- Fachliche Nachvollziehbarkeit (Auftrag §29): Anlegen, Aendern und Loeschen
-- eines Ziels ueber die bereits bestehende, generische Audit-Infrastruktur
-- (entity_type 'goal', Aktion insert/update/delete). Keine zielspezifische
-- Sonderstruktur.
create trigger trg_goals_audit
  after insert or update or delete on goals
  for each row execute function audit_row_change('goal');
