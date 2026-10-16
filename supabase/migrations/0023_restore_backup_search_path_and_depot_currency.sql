-- Nachbesserungen aus dem Audit vom 2026-07-29.
--
-- Kern: `restore_backup()` aus 0022 war gegen das tatsaechliche Schema nie
-- lauffaehig. Bereits eine gueltige, leere Nutzlast scheiterte. Details unten
-- bei Abschnitt 3.
--
-- ============================================================================
-- 1. `search_path` fuer die Sicherungs-Funktionen (0022)
-- ============================================================================
--
-- Alle uebrigen Funktionen des Projekts pinnen ihren `search_path`
-- (0003, 0004, 0011, 0013, 0015, 0016). Die fuenf Funktionen aus 0022 taten es
-- als einzige nicht und erbten damit den Pfad des jeweiligen Aufrufers.
--
-- Genau daran ist `archive_payment()` auf dem echten Supabase-Projekt schon
-- einmal gescheitert (0015): Supabase legt pgcrypto in das Schema `extensions`,
-- nicht in `public`. `restore_backup()` schreibt in `dividend_payments` und
-- loest dabei `recompute_business_fingerprint()` mit `digest()` aus — dieselbe
-- Konstellation. Ohne festen Pfad haengt es vom Aufrufer ab, ob eine
-- Wiederherstellung durchlaeuft.
--
-- `public, extensions` wie in 0015; nicht vorhandene Schemata (etwa
-- `extensions` in der lokalen Test-Datenbank) uebergeht Postgres beim
-- Aufloesen von Namen stillschweigend.
--
-- `alter function` statt `create or replace`: Es aendert ausschliesslich das
-- Attribut und laesst den Rumpf unangetastet — die Logik aus 0022 bleibt Wort
-- fuer Wort bestehen und muss nicht dupliziert werden.

alter function validate_backup_version(int) set search_path = public, extensions;
alter function validate_backup_schema(text) set search_path = public, extensions;
alter function validate_backup_currency(uuid, char) set search_path = public, extensions;
alter function validate_backup_references(jsonb) set search_path = public, extensions;
alter function restore_backup(jsonb, text) set search_path = public, extensions;

-- ============================================================================
-- 2. Basiswaehrung eines Depots gegen die Profilwaehrung binden
-- ============================================================================
--
-- Die Basiswaehrung ist projektweit EUR (DECISIONS.md D-002); Betraege werden
-- ausschliesslich in Basiswaehrung gespeichert, Fremdwaehrungen stehen in
-- `original_currency`/`original_gross`/`original_net`.
--
-- `guard_base_currency_change()` (0009) schuetzt bisher nur
-- `profiles.base_currency`. `depots.base_currency` liess sich dagegen frei auf
-- jeden dreistelligen Code setzen — die Auswertungsschicht rechnet aber fest in
-- Basiswaehrung (`lib/statistics/mapPayment.ts`). Ein Depot mit „USD" erschien
-- dadurch in der Eingangsliste mit „$", in Uebersicht und Statistik mit „€",
-- und beide Betraege wurden miteinander verrechnet.
--
-- Der Trigger stellt her, was ohnehin gilt: Ein Depot fuehrt die Basiswaehrung
-- seines Profils. Bestehende Zeilen werden **nicht** angefasst — eine stille
-- Aenderung historischer Daten waere das groessere Uebel (Grundsatz 6). Wo
-- heute ein abweichender Wert steht, bleibt er stehen und faellt beim naechsten
-- Bearbeiten des Depots auf.

create or replace function guard_depot_base_currency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_profile_currency char(3);
begin
  select base_currency into v_profile_currency
    from profiles where id = new.user_id;

  -- Kein Profil auffindbar (etwa in Testfixtures ohne Profilzeile): nichts
  -- erzwingen, statt das Anlegen des Depots zu verhindern.
  if v_profile_currency is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.base_currency is distinct from v_profile_currency then
      raise exception 'Ein Depot fuehrt die Basiswaehrung des Profils (%)', v_profile_currency
        using errcode = '22023';
    end if;
    return new;
  end if;

  -- UPDATE: Ein unveraenderter Altbestand bleibt zulaessig; nur eine aktive
  -- Aenderung weg von der Profilwaehrung wird abgelehnt.
  if new.base_currency is distinct from old.base_currency
     and new.base_currency is distinct from v_profile_currency then
    raise exception 'Ein Depot fuehrt die Basiswaehrung des Profils (%)', v_profile_currency
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger trg_depots_guard_base_currency
  before insert or update on depots
  for each row execute function guard_depot_base_currency();

-- ============================================================================
-- 3. `restore_backup()` gegen das tatsaechliche Schema korrigieren
-- ============================================================================
--
-- Die Fassung aus 0022 konnte nie durchlaufen. Nachweisbar (Fehler bei einer
-- gueltigen, leeren Nutzlast: `column "archive_reason" of relation "depots"
-- does not exist`) und in Summe:
--
--  a) `archive_reason` wurde auf `securities`, `depots` und `portfolios`
--     geschrieben — die Spalte gibt es ausschliesslich bei
--     `dividend_payments` (0009). Betraf sowohl die Archivierung im Modus
--     "replace" als auch die INSERTs.
--  b) `archived_at` wurde auf `goals` geschrieben — `goals` (0021) kennt
--     ueberhaupt keine Archivierung.
--  c) Die Funktion schrieb direkt in `audit_log`. Als `security invoker` mit
--     der Rolle `authenticated` fehlt dafuer die Berechtigung (0002 vergibt
--     nur SELECT). Protokolliert wird im Projekt ueber die
--     `audit_row_change`-Trigger; die Herkunft steuert die GUC
--     `app.audit_origin` — so machen es `commit_import` und
--     `rollback_import` (0016).
--  d) Das Ergebnis meldete die Mengen unter `records`, der Client liest
--     `records_restored`; ausserdem stammten die Zahlen aus dem
--     Integritaetsblock der **Datei** (Schluessel dort im Singular, hier im
--     Plural gelesen) statt aus dem, was tatsaechlich geschrieben wurde. Die
--     Anzeige nach dem Einspielen haette immer 0 gezeigt.
--  e) Im Modus "replace" wurden alle Zeilen archiviert und anschliessend mit
--     `on conflict (id) do nothing` eingefuegt. Da eine Sicherung dieselben
--     IDs mitbringt, traf jeder INSERT auf einen Konflikt und tat nichts:
--     Wer seine eigene Sicherung im Modus "replace" einspielte, haette
--     seinen gesamten Bestand storniert und nichts zurueckerhalten.
--  f) `exception when others` ersetzte jede Ursache durch `restore_failed`.
--     Der eigentliche Fehler kam nirgends an — auch nicht in der Oberflaeche.
--
-- Festgelegte Bedeutung der beiden Modi:
--
--   merge   — ergaenzt, was fehlt. Vorhandene Zeilen bleiben unangetastet.
--   replace — der Endzustand entspricht der Sicherung: Zeilen aus der Datei
--             gewinnen, alles Uebrige wird **storniert**, nie geloescht.

create or replace function restore_backup(
  p_backup_payload jsonb,
  p_mode text default 'merge'
) returns jsonb as $$
declare
  v_user_id uuid := auth.uid();
  v_format_version int;
  v_schema_version text;
  v_backup_currency char(3);
  v_data jsonb := coalesce(p_backup_payload->'data', '{}'::jsonb);
  v_ids uuid[];
  v_counts jsonb := '{}'::jsonb;
  v_n int;
begin
  -- ------------------------------------------------------------------
  -- 1. Berechtigung und Nutzlast pruefen
  -- ------------------------------------------------------------------
  if v_user_id is null then
    raise exception 'not_authenticated'
      using detail = 'Fuer das Einspielen einer Sicherung ist eine Anmeldung noetig.';
  end if;

  if p_mode not in ('merge', 'replace') then
    raise exception 'invalid_restore_mode'
      using detail = 'Zulaessig sind "merge" und "replace", uebergeben wurde: ' || p_mode;
  end if;

  v_format_version := (p_backup_payload->>'format_version')::int;
  perform validate_backup_version(v_format_version);

  v_schema_version := p_backup_payload->>'schema_version';
  perform validate_backup_schema(v_schema_version);

  v_backup_currency := coalesce(
    p_backup_payload->'metadata'->>'base_currency',
    p_backup_payload->>'base_currency'
  );
  perform validate_backup_currency(v_user_id, v_backup_currency);
  perform validate_backup_references(v_data);

  -- Alle von hier ausgeloesten Audit-Eintraege tragen die Herkunft "restore"
  -- (Mechanismus aus 0003/0016). Ein eigener INSERT in `audit_log` waere
  -- weder noetig noch als `authenticated` erlaubt.
  perform set_config('app.audit_origin', 'restore', true);

  -- ------------------------------------------------------------------
  -- 2. Stammdaten in Fremdschluesselreihenfolge
  -- ------------------------------------------------------------------
  insert into portfolios (id, user_id, name, note, created_at, updated_at, archived_at)
  select
    (obj->>'id')::uuid, v_user_id, obj->>'name', obj->>'note',
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now()),
    (obj->>'archived_at')::timestamptz
  from jsonb_array_elements(coalesce(v_data->'portfolios', '[]'::jsonb)) as x(obj)
  on conflict (id) do update
    set name = excluded.name,
        note = excluded.note,
        archived_at = excluded.archived_at
    where p_mode = 'replace';
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('portfolios', v_n);

  -- Die Basiswaehrung eines Depots folgt dem Profil (siehe Abschnitt 2 dieser
  -- Migration); ein abweichender Wert in der Datei wird nicht uebernommen.
  insert into depots (id, user_id, name, broker, base_currency, portfolio_id, note,
                      created_at, updated_at, archived_at)
  select
    (obj->>'id')::uuid, v_user_id, obj->>'name', obj->>'broker',
    coalesce(obj->>'base_currency', v_backup_currency),
    (obj->>'portfolio_id')::uuid, obj->>'note',
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now()),
    (obj->>'archived_at')::timestamptz
  from jsonb_array_elements(coalesce(v_data->'depots', '[]'::jsonb)) as x(obj)
  on conflict (id) do update
    set name = excluded.name,
        broker = excluded.broker,
        portfolio_id = excluded.portfolio_id,
        note = excluded.note,
        archived_at = excluded.archived_at
    where p_mode = 'replace';
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('depots', v_n);

  insert into securities (id, user_id, name, ticker, isin, wkn, country, sector,
                          currency, note, data_quality, default_depot_id, payout_months,
                          created_at, updated_at, archived_at)
  select
    (obj->>'id')::uuid, v_user_id, obj->>'name', obj->>'ticker', obj->>'isin',
    obj->>'wkn', obj->>'country', obj->>'sector', obj->>'currency', obj->>'note',
    coalesce(obj->>'data_quality', 'ok')::data_quality,
    (obj->>'default_depot_id')::uuid,
    -- `payout_months` ist NOT NULL mit Vorgabe `{}` (0017). Fehlt der Wert in
    -- der Datei oder ist die Liste leer, muss das leere Feld gesetzt werden —
    -- `array_agg` liefert ueber einer leeren Menge sonst NULL.
    coalesce(
      (select array_agg(t.x::smallint)
         from jsonb_array_elements_text(coalesce(obj->'payout_months', '[]'::jsonb)) as t(x)),
      '{}'::smallint[]
    ),
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now()),
    (obj->>'archived_at')::timestamptz
  from jsonb_array_elements(coalesce(v_data->'securities', '[]'::jsonb)) as x(obj)
  on conflict (id) do update
    set name = excluded.name,
        ticker = excluded.ticker,
        isin = excluded.isin,
        wkn = excluded.wkn,
        country = excluded.country,
        sector = excluded.sector,
        currency = excluded.currency,
        note = excluded.note,
        data_quality = excluded.data_quality,
        default_depot_id = excluded.default_depot_id,
        payout_months = excluded.payout_months,
        archived_at = excluded.archived_at
    where p_mode = 'replace';
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('securities', v_n);

  insert into imports (id, user_id, file_name, file_hash, file_size_bytes, file_type,
                       sheet_name, status, column_mapping, detected_formats, row_balance,
                       row_report, checksums, created_at, committed_at, rolled_back_at)
  select
    (obj->>'id')::uuid, v_user_id, obj->>'file_name', obj->>'file_hash',
    (obj->>'file_size_bytes')::bigint, obj->>'file_type', obj->>'sheet_name',
    (obj->>'status')::import_status,
    obj->'column_mapping', obj->'detected_formats', obj->'row_balance',
    obj->'row_report', obj->'checksums',
    coalesce((obj->>'created_at')::timestamptz, now()),
    (obj->>'committed_at')::timestamptz,
    (obj->>'rolled_back_at')::timestamptz
  from jsonb_array_elements(coalesce(v_data->'imports', '[]'::jsonb)) as x(obj)
  on conflict (id) do nothing;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('imports', v_n);

  -- ------------------------------------------------------------------
  -- 3. Dividendeneingaenge
  -- ------------------------------------------------------------------
  insert into dividend_payments (
    id, user_id, security_id, depot_id, import_id,
    pay_date, gross_amount, net_amount, withholding_tax, domestic_tax,
    solidarity_surcharge, church_tax, fees,
    original_currency, original_gross, original_net, fx_rate,
    quantity, amount_per_share,
    payment_type, source, source_file_name, source_row_number,
    row_fingerprint, note, created_at, updated_at, archived_at, archive_reason
  )
  select
    (obj->>'id')::uuid, v_user_id,
    (obj->>'security_id')::uuid, (obj->>'depot_id')::uuid, (obj->>'import_id')::uuid,
    (obj->>'pay_date')::date,
    (obj->>'gross_amount')::numeric(14, 2),
    (obj->>'net_amount')::numeric(14, 2),
    coalesce((obj->>'withholding_tax')::numeric(14, 2), 0),
    coalesce((obj->>'domestic_tax')::numeric(14, 2), 0),
    coalesce((obj->>'solidarity_surcharge')::numeric(14, 2), 0),
    coalesce((obj->>'church_tax')::numeric(14, 2), 0),
    coalesce((obj->>'fees')::numeric(14, 2), 0),
    coalesce(obj->>'original_currency', v_backup_currency),
    (obj->>'original_gross')::numeric(18, 6),
    (obj->>'original_net')::numeric(18, 6),
    (obj->>'fx_rate')::numeric(18, 8),
    (obj->>'quantity')::numeric(18, 6),
    (obj->>'amount_per_share')::numeric(18, 8),
    coalesce(obj->>'payment_type', 'regular')::payment_type,
    'restore'::payment_source,
    obj->>'source_file_name',
    (obj->>'source_row_number')::int,
    obj->>'row_fingerprint',
    obj->>'note',
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now()),
    (obj->>'archived_at')::timestamptz,
    obj->>'archive_reason'
  from jsonb_array_elements(coalesce(v_data->'dividend_payments', '[]'::jsonb)) as x(obj)
  -- `business_fingerprint` steht bewusst nicht in der Spaltenliste: Der
  -- BEFORE-Trigger aus 0009 berechnet ihn aus den fachlichen Feldern neu.
  -- Ein Wert aus der Datei koennte veraltet sein und die Dublettenerkennung
  -- dauerhaft verfaelschen.
  on conflict (id) do update
    set security_id = excluded.security_id,
        depot_id = excluded.depot_id,
        pay_date = excluded.pay_date,
        gross_amount = excluded.gross_amount,
        net_amount = excluded.net_amount,
        archived_at = excluded.archived_at,
        archive_reason = excluded.archive_reason
    where p_mode = 'replace';
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('dividend_payments', v_n);

  -- ------------------------------------------------------------------
  -- 4. Ziele
  -- ------------------------------------------------------------------
  insert into goals (id, user_id, goal_type, year, month, target_amount, currency,
                     title, note, created_at, updated_at)
  select
    (obj->>'id')::uuid, v_user_id,
    (obj->>'goal_type')::goal_type,
    (obj->>'year')::int, (obj->>'month')::int,
    (obj->>'target_amount')::numeric(14, 2),
    coalesce(obj->>'currency', v_backup_currency),
    obj->>'title', obj->>'note',
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(v_data->'goals', '[]'::jsonb)) as x(obj)
  on conflict (id) do update
    set target_amount = excluded.target_amount,
        title = excluded.title,
        note = excluded.note
    where p_mode = 'replace';
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('goals', v_n);

  -- ------------------------------------------------------------------
  -- 5. "replace": alles stornieren, was die Sicherung nicht kennt
  -- ------------------------------------------------------------------
  --
  -- Erst hier, nach dem Einspielen — und ausschliesslich als Stornierung.
  -- Ein Hard Delete waere hier der einzige Vorgang im Projekt, der Historie
  -- unwiederbringlich entfernt (Grundsatz 6, D-034).
  if p_mode = 'replace' then
    select coalesce(array_agg((obj->>'id')::uuid), '{}')
      into v_ids
      from jsonb_array_elements(coalesce(v_data->'dividend_payments', '[]'::jsonb)) as x(obj);

    update dividend_payments
       set archived_at = now(),
           archive_reason = 'Durch Wiederherstellung einer Sicherung ersetzt'
     where user_id = v_user_id
       and archived_at is null
       and not (id = any(v_ids));
  end if;

  -- ------------------------------------------------------------------
  -- 6. Ergebnis
  -- ------------------------------------------------------------------
  --
  -- `records_restored` enthaelt, was **tatsaechlich** geschrieben wurde
  -- (`row_count` je Anweisung) — nicht die Ankuendigung aus dem
  -- Integritaetsblock der Datei. Nur so beantwortet die Anzeige nach dem
  -- Einspielen die Frage, die der Nutzer wirklich hat.
  --
  -- `last_backup_at` wird hier **nicht** gesetzt: Eine Wiederherstellung ist
  -- keine Sicherung. Der Wert wird ausschliesslich nach einem
  -- heruntergeladenen Export fortgeschrieben (backupService.ts).
  return jsonb_build_object(
    'success', true,
    'mode', p_mode,
    'restored_at', now(),
    'records_restored', v_counts,
    'integrity', jsonb_build_object(
      'backup_created_at', p_backup_payload->>'exported_at',
      'backup_format_version', v_format_version,
      'backup_schema_version', v_schema_version
    )
  );
end;
$$ language plpgsql security invoker set search_path = public, extensions;

grant execute on function restore_backup(jsonb, text) to authenticated;
