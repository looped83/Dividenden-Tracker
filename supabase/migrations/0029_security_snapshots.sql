-- Depotstaende aus dem DivvyDiary-Portfolio-Export (docs/PORTFOLIO_IMPORT.md).
--
-- Ein Snapshot ist eine **Momentaufnahme**: Stueckzahl, Kurs, Marktwert und
-- Renditekennzahlen gelten fuer den Tag des Exports und fuer keinen anderen.
-- Deshalb traegt jede Zeile ihren Stichtag (`as_of`) statt einen Wert je
-- Unternehmen zu ueberschreiben — ein Kurs ohne Datum ist keine Auskunft,
-- sondern eine Behauptung.
--
-- Strikt getrennt von `dividend_payments` (PRODUCT_SPEC.md Grundsatz 8):
--   * Hier stehen **Marktdaten und erwartete** Ausschuettungen der Quelle.
--   * Dort stehen die **tatsaechlich erhaltenen** Zahlungen.
-- Kein Snapshot erzeugt eine Zahlung, und kein Wert aus dieser Tabelle geht in
-- Statistik oder Ziele ein. Die Verbindung ist ausschliesslich `security_id`.
--
-- Anders als beim Dividendenkalender (0027) schreibt hier der **Client**: Es
-- gibt kein Secret und keine Edge Function, die Datei wird im Browser gelesen
-- (ARCHITECTURE.md §5). `authenticated` braucht deshalb Schreibrechte auf die
-- eigenen Zeilen; jede Policy prueft `user_id = auth.uid()`.

-- Ausschuettungsrhythmus laut Quelle. `none` ist ein echter Wert (Thesaurierer,
-- Krypto), kein fehlender — und muss deshalb von NULL unterscheidbar bleiben.
create type dividend_frequency as enum (
  'none', 'monthly', 'quarterly', 'biannually', 'annually', 'irregular'
);

-- Gattung laut Quelle. Nur zur Anzeige und Filterung; die App unterscheidet
-- fachlich weiterhin nicht zwischen Aktie und ETF.
create type security_asset_type as enum ('equity', 'etf', 'fund', 'crypto', 'other');

-- Ein Upload = ein Lauf. Ohne diese Tabelle liesse sich „an diesem Tag kein
-- Upload" nicht von „an diesem Tag keine Positionen" unterscheiden; eine
-- Verlaufskurve zeichnete eine fehlende Datei als Depotwert 0.
create table security_snapshot_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,

  -- Maszgeblicher Kalendertag des Bestands. `date`, kein Zeitpunkt: Der Export
  -- beschreibt einen Tagesstand, und eine Zeitzonenumrechnung koennte ihn auf
  -- den Vor- oder Folgetag schieben (dieselbe Regel wie `pay_date`).
  as_of           date not null,

  source          text not null default 'divvydiary_csv'
                    check (length(source) between 1 and 50),
  -- Nur der Dateiname zur Nachvollziehbarkeit, nie der Inhalt.
  file_name       text check (length(file_name) <= 260),

  -- Bilanz des Laufs (IMPORT_SPEC.md §8): Die Summe muss aufgehen, damit
  -- nachvollziehbar bleibt, was mit jeder Zeile der Datei geschehen ist.
  rows_total      integer not null default 0 check (rows_total >= 0),
  rows_imported   integer not null default 0 check (rows_imported >= 0),
  rows_skipped    integer not null default 0 check (rows_skipped >= 0),
  rows_invalid    integer not null default 0 check (rows_invalid >= 0),

  created_at      timestamptz not null default now(),

  -- Ein Stand je Tag und Quelle. Ein zweiter Upload desselben Tages ersetzt den
  -- ersten, statt den Bestand zu verdoppeln.
  constraint security_snapshot_runs_day_unique unique (user_id, source, as_of),
  constraint security_snapshot_runs_balance check (
    rows_total = rows_imported + rows_skipped + rows_invalid
  ),
  -- Zielpunkt des zusammengesetzten Fremdschluessels der Snapshot-Zeilen: Er
  -- bindet deren `as_of` an das des Laufs, sodass beide nicht auseinanderlaufen
  -- koennen (siehe security_snapshots).
  constraint security_snapshot_runs_id_as_of_unique unique (id, as_of)
);

create index security_snapshot_runs_as_of_idx
  on security_snapshot_runs (user_id, as_of desc);

alter table security_snapshot_runs enable row level security;

revoke all on security_snapshot_runs from anon, authenticated;
-- Kein UPDATE: Ein Lauf wird ersetzt (loeschen und neu anlegen), nicht
-- nachtraeglich umgeschrieben. Damit kann eine Bilanz nicht von ihren Zeilen
-- abweichen.
grant select, insert, delete on security_snapshot_runs to authenticated;

create policy security_snapshot_runs_select_own on security_snapshot_runs
  for select to authenticated
  using (user_id = auth.uid());

create policy security_snapshot_runs_insert_own on security_snapshot_runs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy security_snapshot_runs_delete_own on security_snapshot_runs
  for delete to authenticated
  using (user_id = auth.uid());

create trigger trg_security_snapshot_runs_enforce_user_id
  before insert or update on security_snapshot_runs
  for each row execute function enforce_user_id();

-- Eine Zeile je Unternehmen und Stichtag.
create table security_snapshots (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  -- `cascade`: Snapshots sind abgeleitete Daten. Ohne dies wuerde ein Snapshot
  -- das Loeschen eines archivierten Unternehmens mit einem
  -- Fremdschluesselfehler blockieren (0018) — ein Fehler, der erst Monate
  -- spaeter auffiele.
  security_id             uuid not null references securities (id) on delete cascade,
  run_id                  uuid not null,
  -- Bewusst neben `run_id` gefuehrt: Jede Auswertung liest nach Stichtag, und
  -- ein Join auf den Lauf bei jeder Abfrage waere dafuer zu teuer. Damit die
  -- Doppelung nicht auseinanderlaufen kann, zeigt der Fremdschluessel auf
  -- **beide** Spalten des Laufs — ein Snapshot mit fremdem Stichtag ist damit
  -- nicht speicherbar, nicht nur unerwuenscht.
  as_of                   date not null,

  -- --- Position -------------------------------------------------------------
  -- Bruchteile aus Sparplaenen: dieselbe Skala wie dividend_payments.quantity.
  quantity                numeric(18,6) not null check (quantity > 0),
  buyin_per_share         numeric(18,6) check (buyin_per_share >= 0),
  buyin_total             numeric(14,2) check (buyin_total >= 0),
  price                   numeric(18,6) check (price >= 0),
  market_value            numeric(14,2) check (market_value >= 0),
  -- Gewinn darf negativ sein und **fehlen**: Die Quelle laesst die Spalte leer,
  -- wenn sie ihn nicht bestimmen kann. Leer ist nicht null Euro.
  gain_absolute           numeric(14,2),
  gain_relative           numeric(12,6),
  -- Anteil am Gesamtdepot laut Quelle (0.077971 = 7,8 %).
  allocation              numeric(12,6) check (allocation >= 0),

  -- --- Dividende ------------------------------------------------------------
  dividend_yield          numeric(12,6) check (dividend_yield >= 0),
  dividend_yield_on_buyin numeric(12,6) check (dividend_yield_on_buyin >= 0),
  -- Erwartete Jahresausschuettung der **gesamten** Position, in `currency`.
  annual_dividend_total   numeric(14,2) check (annual_dividend_total >= 0),
  -- Erwartete Jahresausschuettung **je Stueck**, in `currency`.
  dividend_per_share      numeric(18,6) check (dividend_per_share >= 0),
  dividend_frequency      dividend_frequency,
  -- Dividendenwachstum laut Quelle; darf negativ sein (Kuerzung).
  dividend_cagr           numeric(12,6),
  dividend_cagr_period    text check (length(dividend_cagr_period) <= 10),

  -- --- Termine --------------------------------------------------------------
  -- Naechster Ex-Tag/Zahltag laut Quelle. Gespeichert fuer die
  -- Nachvollziehbarkeit des Stands, **nicht** fuer die Anzeige: Angekuendigte
  -- Termine zeigt der Dividendenkalender (0027), und derselbe Termin an zwei
  -- Stellen mit zwei Aktualisierungszyklen waere eine Fehlerquelle.
  next_ex_date            date,
  next_pay_date           date,

  -- --- Herkunft -------------------------------------------------------------
  asset_type              security_asset_type,
  -- Waehrung der Betraege dieser Zeile (Depotwaehrung des Exports, nicht die
  -- Ausschuettungswaehrung des Papiers — die steht in `securities.currency`).
  currency                char(3) not null check (currency ~ '^[A-Z]{3}$'),

  created_at              timestamptz not null default now(),

  constraint security_snapshots_day_unique unique (user_id, security_id, as_of),
  constraint security_snapshots_run_fkey
    foreign key (run_id, as_of)
    references security_snapshot_runs (id, as_of)
    on delete cascade
);

-- Die Oberflaeche liest zwei Dinge: alle Zeilen eines Stichtags (Kacheln,
-- Statistik) und alle Stichtage eines Unternehmens (Detailseite, Verlauf).
create index security_snapshots_as_of_idx
  on security_snapshots (user_id, as_of desc, security_id);

create index security_snapshots_security_idx
  on security_snapshots (user_id, security_id, as_of desc);

alter table security_snapshots enable row level security;

revoke all on security_snapshots from anon, authenticated;
-- Kein UPDATE, aus demselben Grund wie beim Lauf: Ein Stichtag wird als Ganzes
-- ersetzt. Eine einzelne nachtraeglich geaenderte Zeile waere eine Zahl, die
-- keine Datei je enthalten hat.
grant select, insert, delete on security_snapshots to authenticated;

create policy security_snapshots_select_own on security_snapshots
  for select to authenticated
  using (user_id = auth.uid());

create policy security_snapshots_insert_own on security_snapshots
  for insert to authenticated
  with check (user_id = auth.uid());

create policy security_snapshots_delete_own on security_snapshots
  for delete to authenticated
  using (user_id = auth.uid());

create trigger trg_security_snapshots_enforce_user_id
  before insert or update on security_snapshots
  for each row execute function enforce_user_id();

-- Der Fremdschluessel auf `securities` prueft nur, dass die Zeile existiert —
-- nicht, wem sie gehoert. Ohne diese Pruefung koennte ein Nutzer einen Stand an
-- das Unternehmen eines anderen haengen; dessen Loeschen risse den fremden
-- Stand dann kaskadierend mit.
--
-- Bewusst **ohne** `security definer`: Die Funktion laeuft mit den Rechten des
-- Aufrufers, und damit erledigt die Row Level Security von `securities` die
-- eigentliche Arbeit — ein fremdes Unternehmen ist schlicht nicht sichtbar und
-- die Pruefung schlaegt fehl. Der Superuser (Migrationen, Seeds) umgeht RLS
-- ohnehin.
create or replace function enforce_own_security()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from securities where id = new.security_id) then
    raise exception 'security_id % gehoert nicht zum eigenen Bestand', new.security_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_security_snapshots_enforce_own_security
  before insert or update on security_snapshots
  for each row execute function enforce_own_security();

comment on table security_snapshots is
  'Depotstand je Unternehmen und Stichtag aus dem DivvyDiary-Portfolio-Export. Marktdaten und erwartete Ausschuettungen — niemals erhaltene Zahlungen (siehe dividend_payments).';

comment on column security_snapshots.currency is
  'Waehrung der Betraege dieser Zeile (Depotwaehrung des Exports). Die uebliche Ausschuettungswaehrung des Papiers steht in securities.currency.';

comment on column security_snapshots.next_pay_date is
  'Naechster Zahltag laut Quelle. Nur zur Nachvollziehbarkeit gespeichert; angezeigt werden angekuendigte Termine ausschliesslich im Dividendenkalender.';
