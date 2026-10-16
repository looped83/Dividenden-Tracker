-- Phase 4 — Produktionsreifer CSV-/Excel-Import (IMPORT_SPEC.md, DATA_MODEL.md §3.6).
--
-- Diese Migration ergaenzt ausschliesslich die bestehende Datenarchitektur:
--   * Herkunftsspalten an securities/depots (welcher Import hat den Datensatz
--     angelegt) — Grundlage fuer archivierte historische Stammdaten und Rollback.
--   * Alias-Tabelle security_aliases (IMPORT_SPEC Stufe C: bestaetigte
--     Namenszuordnungen fuer konsistente Folgeimporte).
--   * import_rows: Zeilen-Herkunft/Provenance je Importzeile (IMPORT_SPEC §16).
--   * commit_import(): atomarer, serverseitig kontrollsummen-verifizierter Import.
--   * rollback_import(): transaktionaler Vollrueckbau eines Imports.
--   * guard_import_status(): committed/rolled_back sind final und ausschliesslich
--     ueber die RPCs erreichbar (SECURITY_MODEL.md §3, §18).
--
-- Es entsteht KEINE parallele/vereinfachte Datenstruktur: importierte Zahlungen
-- landen in dividend_payments, Stammdaten in securities/depots.

-- ---------------------------------------------------------------------------
-- 1. Herkunftsspalten (welcher Import hat den Stammdatensatz erzeugt)
-- ---------------------------------------------------------------------------
alter table securities
  add column created_by_import_id uuid references imports (id);
alter table depots
  add column created_by_import_id uuid references imports (id);

create index securities_created_by_import_idx
  on securities (created_by_import_id) where created_by_import_id is not null;
create index depots_created_by_import_idx
  on depots (created_by_import_id) where created_by_import_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Bestaetigte Namens-Aliase (IMPORT_SPEC Stufe C)
-- ---------------------------------------------------------------------------
create table security_aliases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id),
  alias_normalized text not null check (length(alias_normalized) between 1 and 200),
  security_id      uuid not null references securities (id),
  source_import_id uuid references imports (id),
  created_at       timestamptz not null default now(),
  unique (user_id, alias_normalized)
);

create index security_aliases_security_idx on security_aliases (user_id, security_id);
create index security_aliases_source_import_idx
  on security_aliases (source_import_id) where source_import_id is not null;

alter table security_aliases enable row level security;
revoke all on security_aliases from anon, authenticated;
grant select, insert, delete on security_aliases to authenticated;

create policy security_aliases_select_own on security_aliases
  for select to authenticated using (user_id = auth.uid());
create policy security_aliases_insert_own on security_aliases
  for insert to authenticated with check (user_id = auth.uid());
create policy security_aliases_delete_own on security_aliases
  for delete to authenticated using (user_id = auth.uid());

create trigger trg_security_aliases_enforce_user_id
  before insert or update on security_aliases
  for each row execute function enforce_user_id();

-- ---------------------------------------------------------------------------
-- 3. Zeilen-Herkunft (Provenance) je Importzeile (IMPORT_SPEC §16)
-- ---------------------------------------------------------------------------
create table import_rows (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id),
  import_id         uuid not null references imports (id),
  source_row_number int not null check (source_row_number >= 1),
  payment_id        uuid references dividend_payments (id),
  classification    text not null check (classification in
                      ('imported', 'excluded', 'duplicate_skipped', 'invalid')),
  raw               jsonb not null,
  normalized        jsonb not null,
  warnings          jsonb,
  created_at        timestamptz not null default now(),
  unique (import_id, source_row_number)
);

create index import_rows_import_idx on import_rows (user_id, import_id);
create index import_rows_payment_idx on import_rows (payment_id) where payment_id is not null;

alter table import_rows enable row level security;
revoke all on import_rows from anon, authenticated;
grant select, insert on import_rows to authenticated;

create policy import_rows_select_own on import_rows
  for select to authenticated using (user_id = auth.uid());
create policy import_rows_insert_own on import_rows
  for insert to authenticated with check (user_id = auth.uid());

create trigger trg_import_rows_enforce_user_id
  before insert or update on import_rows
  for each row execute function enforce_user_id();

-- ---------------------------------------------------------------------------
-- 4. Statuswechsel-Guard: committed/rolled_back sind final und nur ueber die
--    RPCs erreichbar (SECURITY_MODEL.md §18: "Client markiert Import selbst als
--    abgeschlossen" muss scheitern).
-- ---------------------------------------------------------------------------
create or replace function guard_import_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status in ('committed', 'rolled_back')
       and current_setting('app.import_txn', true) is distinct from 'on' then
      raise exception 'Importstatus % ist final', old.status using errcode = '42501';
    end if;
    if new.status in ('committed', 'rolled_back')
       and current_setting('app.import_txn', true) is distinct from 'on' then
      raise exception 'Statuswechsel nur ueber commit_import()/rollback_import()'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_imports_guard_status
  before update on imports
  for each row execute function guard_import_status();

-- ---------------------------------------------------------------------------
-- 5. commit_import(): atomarer Import mit serverseitiger Kontrollsummenpruefung.
--    security invoker => RLS bleibt aktiv; jede Zeile durchlaeuft dieselben
--    Trigger/Checks wie ein manueller Eingang. Ein einziger Aufruf, eine
--    Transaktion — kein Teilzustand (IMPORT_SPEC §22, Grundsatz gegen 1.439
--    Einzel-Inserts).
--
--    p_payload-Struktur:
--    {
--      "expected": { "row_count", "total_net", "min_date", "max_date",
--                    "by_year": { "<jahr>": { "count", "sum" } },
--                    "by_broker": { "<name>": { "count" } } },
--      "new_securities": [ { "key", "name" } ],
--      "new_depots":     [ { "key", "name", "broker" } ],
--      "aliases":        [ { "alias_normalized", "security_ref": {type,id|key} } ],
--      "rows": [ {
--          "source_row_number", "pay_date", "net_amount", "currency",
--          "security_ref": {"type":"existing","id"} | {"type":"new","key"},
--          "depot_ref":    {"type":"existing","id"} | {"type":"new","key"},
--          "row_fingerprint",
--          "raw": {...}, "normalized": {...}, "warnings": [...]
--      } ]
--    }
-- ---------------------------------------------------------------------------
create or replace function commit_import(p_import_id uuid, p_payload jsonb)
returns imports
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_import      imports;
  v_file_type   text;
  v_source      payment_source;
  v_base_ccy    char(3);
  v_sec_map     jsonb := '{}'::jsonb;   -- key -> security_id
  v_dep_map     jsonb := '{}'::jsonb;   -- key -> depot_id
  v_elem        jsonb;
  v_new_id      uuid;
  v_key         text;
  v_sec_id      uuid;
  v_dep_id      uuid;
  v_pay_id      uuid;
  v_expected    jsonb := coalesce(p_payload -> 'expected', '{}'::jsonb);
  -- Ist-Kontrollsummen
  v_count       int;
  v_sum         numeric(14, 2);
  v_min         date;
  v_max         date;
  v_by_year     jsonb;
  v_by_broker   jsonb;
begin
  perform set_config('app.import_txn', 'on', true);
  perform set_config('app.audit_origin', 'import', true);

  -- Import sperren und Berechtigung/Status pruefen (kein Info-Leak: "nicht
  -- gefunden" und "keine Berechtigung" sind ununterscheidbar).
  select * into v_import
  from imports
  where id = p_import_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Import nicht gefunden oder keine Berechtigung' using errcode = 'P0002';
  end if;
  if v_import.status not in ('analyzing', 'pending_confirmation') then
    raise exception 'Import ist nicht mehr bestaetigbar (Status %)', v_import.status
      using errcode = '42501';
  end if;

  v_file_type := v_import.file_type;
  v_source := case when v_file_type = 'csv' then 'csv_import' else 'excel_import' end::payment_source;

  select base_currency into v_base_ccy from profiles where id = auth.uid();
  v_base_ccy := coalesce(v_base_ccy, 'EUR');

  -- 5a. Neue (archivierte, historische) Wertpapiere anlegen.
  for v_elem in select * from jsonb_array_elements(coalesce(p_payload -> 'new_securities', '[]'::jsonb))
  loop
    insert into securities (user_id, name, data_quality, archived_at, created_by_import_id)
    values (auth.uid(), v_elem ->> 'name', 'incomplete', now(), p_import_id)
    returning id into v_new_id;
    v_sec_map := v_sec_map || jsonb_build_object(v_elem ->> 'key', v_new_id::text);
  end loop;

  -- 5b. Neue Depots anlegen.
  for v_elem in select * from jsonb_array_elements(coalesce(p_payload -> 'new_depots', '[]'::jsonb))
  loop
    insert into depots (user_id, name, broker, base_currency, created_by_import_id)
    values (auth.uid(), v_elem ->> 'name', v_elem ->> 'broker', v_base_ccy, p_import_id)
    returning id into v_new_id;
    v_dep_map := v_dep_map || jsonb_build_object(v_elem ->> 'key', v_new_id::text);
  end loop;

  -- 5c. Bestaetigte Aliase speichern.
  for v_elem in select * from jsonb_array_elements(coalesce(p_payload -> 'aliases', '[]'::jsonb))
  loop
    if (v_elem -> 'security_ref' ->> 'type') = 'new' then
      v_sec_id := (v_sec_map ->> (v_elem -> 'security_ref' ->> 'key'))::uuid;
    else
      v_sec_id := (v_elem -> 'security_ref' ->> 'id')::uuid;
    end if;
    insert into security_aliases (user_id, alias_normalized, security_id, source_import_id)
    values (auth.uid(), v_elem ->> 'alias_normalized', v_sec_id, p_import_id)
    on conflict (user_id, alias_normalized) do nothing;
  end loop;

  -- 5d. Zeilen einfuegen (Zahlung + Provenance). Ein Insert je Zeile, aber
  --     alles in dieser einen Transaktion.
  for v_elem in select * from jsonb_array_elements(coalesce(p_payload -> 'rows', '[]'::jsonb))
  loop
    if (v_elem -> 'security_ref' ->> 'type') = 'new' then
      v_key := v_elem -> 'security_ref' ->> 'key';
      v_sec_id := (v_sec_map ->> v_key)::uuid;
      if v_sec_id is null then
        raise exception 'Unbekannter Wertpapier-Schluessel % in Zeile %',
          v_key, v_elem ->> 'source_row_number';
      end if;
    else
      v_sec_id := (v_elem -> 'security_ref' ->> 'id')::uuid;
    end if;

    if (v_elem -> 'depot_ref' ->> 'type') = 'new' then
      v_key := v_elem -> 'depot_ref' ->> 'key';
      v_dep_id := (v_dep_map ->> v_key)::uuid;
      if v_dep_id is null then
        raise exception 'Unbekannter Depot-Schluessel % in Zeile %',
          v_key, v_elem ->> 'source_row_number';
      end if;
    else
      v_dep_id := (v_elem -> 'depot_ref' ->> 'id')::uuid;
    end if;

    -- Netto-only-Import (IMPORT_SPEC §4): brutto = netto, Steuern = 0 nach
    -- ausdruecklicher Nutzerentscheidung. Keine erfundenen Steuern/FX/Stueckzahlen.
    insert into dividend_payments (
      user_id, security_id, depot_id, pay_date,
      gross_amount, net_amount, original_currency,
      payment_type, source, import_id, source_file_name,
      source_row_number, row_fingerprint
    ) values (
      auth.uid(), v_sec_id, v_dep_id, (v_elem ->> 'pay_date')::date,
      (v_elem ->> 'net_amount')::numeric, (v_elem ->> 'net_amount')::numeric,
      coalesce(v_elem ->> 'currency', v_base_ccy),
      'regular', v_source, p_import_id, v_import.file_name,
      (v_elem ->> 'source_row_number')::int, v_elem ->> 'row_fingerprint'
    ) returning id into v_pay_id;

    insert into import_rows (
      user_id, import_id, source_row_number, payment_id, classification, raw, normalized, warnings
    ) values (
      auth.uid(), p_import_id, (v_elem ->> 'source_row_number')::int, v_pay_id, 'imported',
      coalesce(v_elem -> 'raw', '{}'::jsonb), coalesce(v_elem -> 'normalized', '{}'::jsonb),
      v_elem -> 'warnings'
    );
  end loop;

  -- 5e. Serverseitige Kontrollsummen (IMPORT_SPEC §8, §23) aus den tatsaechlich
  --     gespeicherten Zeilen berechnen.
  select count(*), coalesce(sum(net_amount), 0), min(pay_date), max(pay_date)
    into v_count, v_sum, v_min, v_max
  from dividend_payments where import_id = p_import_id;

  select coalesce(jsonb_object_agg(y::text, jsonb_build_object('count', c, 'sum', s::text)), '{}'::jsonb)
    into v_by_year
  from (
    select extract(year from pay_date)::int as y, count(*) c, sum(net_amount) s
    from dividend_payments where import_id = p_import_id group by 1
  ) t;

  select coalesce(jsonb_object_agg(broker, jsonb_build_object('count', c)), '{}'::jsonb)
    into v_by_broker
  from (
    select normalized ->> 'broker' as broker, count(*) c
    from import_rows where import_id = p_import_id and classification = 'imported'
    group by 1
  ) t;

  -- 5f. Ist gegen Erwartung pruefen. Jede Abweichung rollt die ganze
  --     Transaktion zurueck (IMPORT_SPEC §22/§23).
  if v_expected ? 'row_count' and v_count is distinct from (v_expected ->> 'row_count')::int then
    raise exception 'Kontrollsumme Zeilenanzahl: erwartet %, gespeichert %',
      v_expected ->> 'row_count', v_count using errcode = 'P0001';
  end if;
  if v_expected ? 'total_net' and v_sum is distinct from (v_expected ->> 'total_net')::numeric then
    raise exception 'Kontrollsumme Gesamtbetrag: erwartet %, gespeichert %',
      v_expected ->> 'total_net', v_sum using errcode = 'P0001';
  end if;
  if v_expected ? 'min_date' and v_min is distinct from (v_expected ->> 'min_date')::date then
    raise exception 'Kontrollsumme fruehestes Datum: erwartet %, gespeichert %',
      v_expected ->> 'min_date', v_min using errcode = 'P0001';
  end if;
  if v_expected ? 'max_date' and v_max is distinct from (v_expected ->> 'max_date')::date then
    raise exception 'Kontrollsumme spaetestes Datum: erwartet %, gespeichert %',
      v_expected ->> 'max_date', v_max using errcode = 'P0001';
  end if;
  if v_expected ? 'by_year' and (v_expected -> 'by_year') is distinct from v_by_year then
    raise exception 'Kontrollsumme Jahreswerte weichen ab' using errcode = 'P0001',
      detail = v_by_year::text;
  end if;
  if v_expected ? 'by_broker' and (v_expected -> 'by_broker') is distinct from v_by_broker then
    raise exception 'Kontrollsumme Brokerwerte weichen ab' using errcode = 'P0001',
      detail = v_by_broker::text;
  end if;

  -- 5g. Import als committed markieren und Bericht persistieren.
  update imports set
    status = 'committed',
    committed_at = now(),
    sheet_name = coalesce(p_payload ->> 'sheet_name', sheet_name),
    column_mapping = coalesce(p_payload -> 'column_mapping', column_mapping),
    checksums = jsonb_build_object(
      'row_count', v_count, 'total_net', v_sum::text,
      'min_date', v_min::text, 'max_date', v_max::text,
      'by_year', v_by_year, 'by_broker', v_by_broker
    ),
    row_balance = coalesce(p_payload -> 'row_balance', row_balance),
    row_report = coalesce(p_payload -> 'row_report', row_report)
  where id = p_import_id
  returning * into v_import;

  return v_import;
end;
$$;

grant execute on function commit_import(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. rollback_import(): vollstaendiger, transaktionaler Rueckbau (IMPORT_SPEC §10/§17).
-- ---------------------------------------------------------------------------
create or replace function rollback_import(p_import_id uuid)
returns imports
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_import imports;
begin
  perform set_config('app.import_txn', 'on', true);
  perform set_config('app.audit_origin', 'rollback', true);

  select * into v_import
  from imports
  where id = p_import_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Import nicht gefunden oder keine Berechtigung' using errcode = 'P0002';
  end if;
  if v_import.status <> 'committed' then
    raise exception 'Nur abgeschlossene Importe koennen zurueckgerollt werden (Status %)',
      v_import.status using errcode = '42501';
  end if;

  -- 6a. Alle aktiven Zahlungen dieses Imports archivieren (Soft Delete,
  --     audit-erhaltend). Bereits archivierte bleiben unveraendert.
  update dividend_payments
  set archived_at = now(), archive_reason = 'Import-Rollback'
  where import_id = p_import_id and user_id = auth.uid() and archived_at is null;

  -- 6b. Durch diesen Import angelegte Wertpapiere archiviert lassen/archivieren,
  --     sofern keine anderen aktiven Zahlungen mehr darauf verweisen.
  update securities s
  set archived_at = coalesce(s.archived_at, now())
  where s.created_by_import_id = p_import_id
    and s.user_id = auth.uid()
    and not exists (
      select 1 from dividend_payments dp
      where dp.security_id = s.id and dp.archived_at is null
    );

  -- 6c. Analog fuer durch diesen Import angelegte Depots.
  update depots d
  set archived_at = coalesce(d.archived_at, now())
  where d.created_by_import_id = p_import_id
    and d.user_id = auth.uid()
    and not exists (
      select 1 from dividend_payments dp
      where dp.depot_id = d.id and dp.archived_at is null
    );

  -- 6d. Aliase, die ausschliesslich aus diesem Import stammen, entfernen.
  delete from security_aliases
  where source_import_id = p_import_id and user_id = auth.uid();

  -- 6e. Importstatus final auf rolled_back setzen. Der Importdatensatz selbst
  --     bleibt als Historie erhalten.
  update imports set status = 'rolled_back', rolled_back_at = now()
  where id = p_import_id
  returning * into v_import;

  return v_import;
end;
$$;

grant execute on function rollback_import(uuid) to authenticated;
