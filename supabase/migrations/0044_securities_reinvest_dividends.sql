-- Automatische Reinvestition der Dividenden je Asset (DATA_MODEL.md §3.4).
--
-- Broker wie Trade Republic und Scalable Capital kaufen mit der Ausschüttung
-- auf Wunsch automatisch Anteile desselben Papiers nach. Die Einstellung
-- gilt je Asset, nicht je Asset und Depot: Ein Papier liegt in der Praxis in
-- einem Depot. Läge es in zweien mit verschiedener Einstellung, bildete das
-- Feld das nicht ab — bewusst, eine Tabelle je Depot wäre dafür zu schwer.
-- Eine Eigenschaft des Bestands, keine Annahme für Rechnungen — deshalb als
-- Spalte an `securities` (nicht am Profil wie 0043) und mit in der
-- Datensicherung.
--
-- Rechte: `grant select, insert, update on securities to authenticated`
-- (0007) und die RLS-Policies auf die eigenen Zeilen gelten für die neue
-- Spalte unverändert.

alter table securities
  add column reinvest_dividends boolean not null default false;

-- `restore_backup` unverändert aus 0040, nur mit `reinvest_dividends`.
-- Ältere Sicherungen ohne das Feld spielen „aus" ein.
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


  -- ------------------------------------------------------------------
  -- 2. Stammdaten in Fremdschluesselreihenfolge
  -- ------------------------------------------------------------------
  -- Portfolios gibt es seit 0039 nicht mehr (ADR-010). `data.portfolios` und
  -- `depots[].portfolio_id` aelterer Sicherungen werden uebergangen.
  -- Die Basiswaehrung eines Depots folgt dem Profil (siehe 0023); ein
  -- abweichender Wert in der Datei wird nicht uebernommen.
  insert into depots (id, user_id, name, broker, base_currency, note,
                      created_at, updated_at, archived_at)
  select
    (obj->>'id')::uuid, v_user_id, obj->>'name', obj->>'broker',
    coalesce(obj->>'base_currency', v_backup_currency),
    obj->>'note',
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now()),
    (obj->>'archived_at')::timestamptz
  from jsonb_array_elements(coalesce(v_data->'depots', '[]'::jsonb)) as x(obj)
  on conflict (id) do update
    set name = excluded.name,
        broker = excluded.broker,
        note = excluded.note,
        archived_at = excluded.archived_at
    where p_mode = 'replace';
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('depots', v_n);

  insert into securities (id, user_id, name, ticker, isin, wkn, country, sector,
                          currency, note, data_quality, default_depot_id, payout_months,
                          reinvest_dividends, created_at, updated_at, archived_at)
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
    coalesce((obj->>'reinvest_dividends')::boolean, false),
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
        reinvest_dividends = excluded.reinvest_dividends,
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
    payment_type, source, note, created_at, updated_at, archived_at, archive_reason
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
    obj->>'note',
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now()),
    (obj->>'archived_at')::timestamptz,
    obj->>'archive_reason'
  from jsonb_array_elements(coalesce(v_data->'dividend_payments', '[]'::jsonb)) as x(obj)
  -- Die Importfelder aelterer Sicherungen (Dateiname, Zeilennummer,
  -- Fingerprints) gibt es seit 0038 nicht mehr; sie werden uebergangen.
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
