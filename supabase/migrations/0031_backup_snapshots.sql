-- Depotstaende, Upload-Laeufe und bestaetigte Schreibweisen in die Sicherung.
--
-- Ausloeser: Seit 0029 stehen die Depotstaende aus dem DivvyDiary-Export in
-- der Datenbank, und der Statistikbereich „Entwicklung" baut auf ihnen auf.
-- Die Sicherung kannte sie nicht — eine wiederhergestellte Datenbank haette
-- also alle Zahlungen zurueck, aber keine einzige Zeitreihe.
--
-- Warum ausgerechnet diese drei Tabellen und nicht mehr:
--
--   * `security_snapshots` ist **nicht rekonstruierbar**. DivvyDiary
--     exportiert ausschliesslich den heutigen Stand; ein verlorener Stichtag
--     ist endgueltig weg. Das unterscheidet die Staende von den
--     Kalenderterminen (0027), die ein erneuter Feed-Abgleich wieder aufbaut,
--     und deshalb bleiben jene weiterhin aussen vor.
--   * `security_snapshot_runs` traegt den Stichtag des Fremdschluessels und
--     die Bilanz des Uploads. Ohne sie liesse sich „an diesem Tag kein Upload"
--     nicht von „an diesem Tag keine Positionen" unterscheiden.
--   * `security_aliases` waere zwar rekonstruierbar — aber nur, indem der
--     Nutzer jede beim Import bestaetigte Schreibweise erneut bestaetigt.
--     Genau diese Arbeit soll eine Sicherung ihm abnehmen.
--
-- Die Formatversion der Sicherungsdatei steigt damit auf 2. Version 1 bleibt
-- ausdruecklich einspielbar: Sie enthaelt die neuen Bereiche schlicht nicht.
-- Eine aeltere Sicherung abzuweisen, weil das Format gewachsen ist, waere
-- genau der Moment, in dem eine Datensicherung nichts mehr wert ist.

-- ============================================================================
-- 1. Formatversion 1 **und** 2 einspielbar
-- ============================================================================
--
-- `create or replace` setzt alle Funktionsattribute zurueck — der in 0023
-- nachgereichte `search_path` muss deshalb hier wieder mitgeschrieben werden.
create or replace function validate_backup_version(
  p_format_version int
) returns void as $$
begin
  if p_format_version not in (1, 2) then
    raise exception 'unsupported_format_version' using
      detail = 'Backup format version ' || p_format_version || ' is not supported. Expected version 1 or 2.',
      hint = 'Update the application or use a compatible backup file.';
  end if;
end;
$$ language plpgsql stable set search_path = public, extensions;

-- ============================================================================
-- 2. Verweise der neuen Bereiche pruefen
-- ============================================================================
--
-- Eigene Funktion statt einer Erweiterung von `validate_backup_references`:
-- Additiv, ohne deren Rumpf zu duplizieren — und damit ohne die Gefahr, beim
-- Abschreiben etwas zu verlieren (genau so entstand der Fehler, den 0026
-- reparieren musste).
--
-- Der Zweck ist eine **lesbare Fehlermeldung**. Ohne diese Pruefung schluege
-- dieselbe Datei eine Anweisung spaeter mit einer Fremdschluesselverletzung
-- fehl, deren Text niemandem sagt, was mit der Datei nicht stimmt.
create or replace function validate_snapshot_references(
  p_data jsonb
) returns void as $$
declare
  v_security_ids uuid[];
  v_import_ids uuid[];
  -- Lauf-Kennung und Stichtag zusammen: Der Fremdschluessel der Staende zeigt
  -- auf **beide** Spalten (0029). Verglichen wird der Text aus der Datei,
  -- nicht ein Datum — damit haengt das Ergebnis an keiner Datumsdarstellung.
  v_run_keys text[];
  v_bad text;
begin
  select coalesce(array_agg(distinct (obj->>'id')::uuid), '{}')
    into v_security_ids
    from jsonb_array_elements(coalesce(p_data->'securities', '[]'::jsonb)) as x(obj);

  select coalesce(array_agg(distinct (obj->>'id')::uuid), '{}')
    into v_import_ids
    from jsonb_array_elements(coalesce(p_data->'imports', '[]'::jsonb)) as x(obj);

  select coalesce(array_agg((obj->>'id') || '@' || (obj->>'as_of')), '{}')
    into v_run_keys
    from jsonb_array_elements(coalesce(p_data->'security_snapshot_runs', '[]'::jsonb)) as x(obj);

  -- --- Schreibweisen --------------------------------------------------------
  select obj->>'id' into v_bad
    from jsonb_array_elements(coalesce(p_data->'security_aliases', '[]'::jsonb)) as x(obj)
   where not ((obj->>'security_id')::uuid = any(v_security_ids))
   limit 1;

  if v_bad is not null then
    raise exception 'missing_security_reference' using
      detail = 'Die bestaetigte Schreibweise ' || v_bad || ' verweist auf ein Unternehmen, ' ||
               'das die Sicherung nicht enthaelt.',
      hint = 'Die Datei ist unvollstaendig. Bitte eine vollstaendige Sicherung verwenden.';
  end if;

  select obj->>'id' into v_bad
    from jsonb_array_elements(coalesce(p_data->'security_aliases', '[]'::jsonb)) as x(obj)
   where obj->>'source_import_id' is not null
     and not ((obj->>'source_import_id')::uuid = any(v_import_ids))
   limit 1;

  if v_bad is not null then
    raise exception 'missing_import_reference' using
      detail = 'Die bestaetigte Schreibweise ' || v_bad || ' verweist auf einen Importvorgang, ' ||
               'den die Sicherung nicht enthaelt.',
      hint = 'Die Datei ist unvollstaendig. Bitte eine vollstaendige Sicherung verwenden.';
  end if;

  -- --- Depotstaende ---------------------------------------------------------
  select obj->>'id' into v_bad
    from jsonb_array_elements(coalesce(p_data->'security_snapshots', '[]'::jsonb)) as x(obj)
   where not ((obj->>'security_id')::uuid = any(v_security_ids))
   limit 1;

  if v_bad is not null then
    raise exception 'missing_security_reference' using
      detail = 'Der Depotstand ' || v_bad || ' verweist auf ein Unternehmen, das die ' ||
               'Sicherung nicht enthaelt.',
      hint = 'Die Datei ist unvollstaendig. Bitte eine vollstaendige Sicherung verwenden.';
  end if;

  select obj->>'id' into v_bad
    from jsonb_array_elements(coalesce(p_data->'security_snapshots', '[]'::jsonb)) as x(obj)
   where not (((obj->>'run_id') || '@' || (obj->>'as_of')) = any(v_run_keys))
   limit 1;

  if v_bad is not null then
    raise exception 'missing_run_reference' using
      detail = 'Der Depotstand ' || v_bad || ' verweist auf keinen Upload-Lauf desselben ' ||
               'Stichtags in dieser Sicherung.',
      hint = 'Die Datei ist unvollstaendig. Bitte eine vollstaendige Sicherung verwenden.';
  end if;
end;
$$ language plpgsql stable set search_path = public, extensions;

grant execute on function validate_snapshot_references(jsonb) to authenticated;

-- ============================================================================
-- 3. `restore_backup` um die drei Bereiche erweitern
-- ============================================================================
--
-- Der Rumpf entspricht dem aus 0026; neu sind der Aufruf von
-- `validate_snapshot_references` in Abschnitt 1 und der Abschnitt 4b.

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
  -- Bei einer Datei der Version 1 sind die geprueften Listen leer; die
  -- Funktion laeuft dann folgenlos durch.
  perform validate_snapshot_references(v_data);

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

  -- Die Basiswaehrung eines Depots folgt dem Profil (siehe 0023); ein
  -- abweichender Wert in der Datei wird nicht uebernommen.
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
  -- 2b. Sind alle Kennungen der Sicherung im eigenen Bestand angekommen?
  -- ------------------------------------------------------------------
  --
  -- Muss **hier** stehen: nach den Stammdaten, vor den Zahlungen. Fehlt eine
  -- Kennung jetzt noch, gehoert sie einem anderen Konto (ein INSERT haette sie
  -- sonst angelegt) — und die Zahlung wuerde gleich darauf mit
  -- "security_id ... nicht gefunden" scheitern, einer Meldung, die den Grund
  -- verschweigt.
  perform assert_restore_ids_available(v_data);

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
    -- `source` bleibt, wie es war (0026): Es fest auf 'restore' zu setzen
    -- verletzte `import_fields_consistency`.
    coalesce(obj->>'source', 'manual')::payment_source,
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
  -- 4b. Bestaetigte Schreibweisen und Depotstaende (Formatversion 2)
  -- ------------------------------------------------------------------
  --
  -- Alle drei Tabellen kennen **kein UPDATE-Recht** (0016, 0029): Ein Alias
  -- wird angelegt oder geloescht, ein Stichtag als Ganzes ersetzt, nie
  -- zeilenweise umgeschrieben. Diese Regel gilt auch hier, und daraus folgt
  -- der Aufbau dieses Abschnitts:
  --
  --   * `merge` fuegt nur hinzu. Was schon dasteht, bleibt unberuehrt —
  --     `on conflict do nothing` **ohne** Zielangabe, damit auch ein Treffer
  --     auf den fachlichen Eindeutigkeitsschluessel (Alias je Schreibweise,
  --     Lauf je Tag, Stand je Unternehmen und Tag) still uebergangen wird
  --     statt die ganze Wiederherstellung abzubrechen.
  --   * `replace` raeumt vorher genau das weg, was die Datei mitbringt —
  --     nicht mehr. Ein Stichtag, den die Sicherung nicht kennt, bleibt
  --     bestehen: Sein Loeschen waere unwiederbringlich (die Quelle liefert
  --     nur den heutigen Stand), und die Datei behauptet ueber ihn nichts.
  if p_mode = 'replace' then
    delete from security_aliases a
     where a.user_id = v_user_id
       and exists (
         select 1
           from jsonb_array_elements(coalesce(v_data->'security_aliases', '[]'::jsonb)) as x(obj)
          where obj->>'alias_normalized' = a.alias_normalized
       );

    -- Loescht kaskadierend auch die Staende des Tages (0029) — Lauf und Zeilen
    -- gehoeren zusammen und werden nur gemeinsam ersetzt.
    delete from security_snapshot_runs r
     where r.user_id = v_user_id
       and exists (
         select 1
           from jsonb_array_elements(coalesce(v_data->'security_snapshot_runs', '[]'::jsonb)) as x(obj)
          where obj->>'source' = r.source
            and (obj->>'as_of')::date = r.as_of
       );
  end if;

  insert into security_aliases (id, user_id, alias_normalized, security_id,
                                source_import_id, created_at)
  select
    (obj->>'id')::uuid, v_user_id, obj->>'alias_normalized',
    (obj->>'security_id')::uuid, (obj->>'source_import_id')::uuid,
    coalesce((obj->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(v_data->'security_aliases', '[]'::jsonb)) as x(obj)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('security_aliases', v_n);

  insert into security_snapshot_runs (id, user_id, as_of, source, file_name,
                                      rows_total, rows_imported, rows_skipped,
                                      rows_invalid, created_at)
  select
    (obj->>'id')::uuid, v_user_id, (obj->>'as_of')::date,
    coalesce(obj->>'source', 'divvydiary_csv'), obj->>'file_name',
    coalesce((obj->>'rows_total')::int, 0),
    coalesce((obj->>'rows_imported')::int, 0),
    coalesce((obj->>'rows_skipped')::int, 0),
    coalesce((obj->>'rows_invalid')::int, 0),
    coalesce((obj->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(v_data->'security_snapshot_runs', '[]'::jsonb)) as x(obj)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('security_snapshot_runs', v_n);

  insert into security_snapshots (
    id, user_id, security_id, run_id, as_of,
    quantity, buyin_per_share, buyin_total, price, market_value,
    gain_absolute, gain_relative, allocation,
    dividend_yield, dividend_yield_on_buyin, annual_dividend_total,
    dividend_per_share, dividend_frequency, dividend_cagr, dividend_cagr_period,
    next_ex_date, next_pay_date, asset_type, currency, created_at
  )
  select
    (obj->>'id')::uuid, v_user_id,
    (obj->>'security_id')::uuid, (obj->>'run_id')::uuid, (obj->>'as_of')::date,
    (obj->>'quantity')::numeric(18, 6),
    (obj->>'buyin_per_share')::numeric(18, 6),
    (obj->>'buyin_total')::numeric(14, 2),
    (obj->>'price')::numeric(18, 6),
    (obj->>'market_value')::numeric(14, 2),
    (obj->>'gain_absolute')::numeric(14, 2),
    (obj->>'gain_relative')::numeric(12, 6),
    (obj->>'allocation')::numeric(12, 6),
    (obj->>'dividend_yield')::numeric(12, 6),
    (obj->>'dividend_yield_on_buyin')::numeric(12, 6),
    (obj->>'annual_dividend_total')::numeric(14, 2),
    (obj->>'dividend_per_share')::numeric(18, 6),
    (obj->>'dividend_frequency')::dividend_frequency,
    (obj->>'dividend_cagr')::numeric(12, 6),
    obj->>'dividend_cagr_period',
    (obj->>'next_ex_date')::date,
    (obj->>'next_pay_date')::date,
    (obj->>'asset_type')::security_asset_type,
    coalesce(obj->>'currency', v_backup_currency),
    coalesce((obj->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(v_data->'security_snapshots', '[]'::jsonb)) as x(obj)
  -- Ein Stand ohne seinen Lauf ist nicht speicherbar (zusammengesetzter
  -- Fremdschluessel, 0029). Wurde der Lauf oben uebergangen, weil fuer diesen
  -- Tag bereits einer vorliegt, gilt derselbe Tag auch hier als vergeben —
  -- sonst brechen die Staende mit einer Fremdschluesselverletzung ab, obwohl
  -- der Bestand in Ordnung ist.
  where exists (
    select 1 from security_snapshot_runs r
     where r.id = (obj->>'run_id')::uuid
       and r.as_of = (obj->>'as_of')::date
  )
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('security_snapshots', v_n);

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
  -- Integritaetsblock der Datei.
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
