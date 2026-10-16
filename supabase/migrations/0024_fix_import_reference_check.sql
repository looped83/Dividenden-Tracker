-- `validate_backup_references()` lehnte jede Sicherung mit importierten
-- Zahlungen ab.
--
-- Gefunden beim ersten echten Wiederherstellungsversuch (2026-07-29):
-- `missing_import_reference`, obwohl die Sicherung sämtliche Importvorgänge
-- enthielt.
--
-- Ursache — ein Kopierfehler in 0022:
--
--     for v_import_id in
--       select distinct (obj->>'id')::uuid          -- die ID der ZAHLUNG
--       from jsonb_array_elements(... 'dividend_payments' ...) as x(obj)
--       where (obj->>'import_id') is not null
--     loop
--       if not exists(select 1 from ... 'imports' ... where id = v_import_id)
--
-- Gelesen wurde `id` statt `import_id`. Die Schleife prüfte also, ob die
-- **Zahlungs-ID** unter den Importvorgängen vorkommt — das tut sie nie. Damit
-- scheiterte jede Sicherung, die auch nur eine importierte Zahlung enthielt,
-- also praktisch jede Sicherung dieses Projekts. Nur ein Bestand ohne
-- Importherkunft kam durch.
--
-- Die Prüfung selbst ist richtig gemeint: Verweist eine Zahlung auf einen
-- Importvorgang, muss dieser mitgesichert sein — sonst schlüge der
-- Fremdschlüssel beim Einfügen zu, mit einer weit unverständlicheren Meldung.
--
-- Zusätzlich abgesichert: Sind Wertpapiere oder Depots im Backup leer, liefert
-- `array_agg` NULL. `x = any(NULL)` ergibt NULL, `not NULL` ebenfalls NULL,
-- und `if NULL then` ist falsch — die Prüfung fiel dann stillschweigend aus.
-- `coalesce(..., '{}')` stellt sicher, dass ein leeres Feld auch als leer
-- geprüft wird.

create or replace function validate_backup_references(
  p_data jsonb
) returns void as $$
declare
  v_security_ids uuid[];
  v_depot_ids uuid[];
  v_import_ids uuid[];
  v_payment record;
  v_import_id uuid;
  v_goal record;
begin
  select coalesce(array_agg(distinct (obj->>'id')::uuid), '{}')
    into v_security_ids
    from jsonb_array_elements(coalesce(p_data->'securities', '[]'::jsonb)) as x(obj)
    where obj->>'id' is not null;

  select coalesce(array_agg(distinct (obj->>'id')::uuid), '{}')
    into v_depot_ids
    from jsonb_array_elements(coalesce(p_data->'depots', '[]'::jsonb)) as x(obj)
    where obj->>'id' is not null;

  select coalesce(array_agg(distinct (obj->>'id')::uuid), '{}')
    into v_import_ids
    from jsonb_array_elements(coalesce(p_data->'imports', '[]'::jsonb)) as x(obj)
    where obj->>'id' is not null;

  for v_payment in
    select obj->>'id' as payment_id,
           (obj->>'security_id')::uuid as security_id,
           (obj->>'depot_id')::uuid as depot_id
    from jsonb_array_elements(coalesce(p_data->'dividend_payments', '[]'::jsonb)) as x(obj)
  loop
    if not v_payment.security_id = any(v_security_ids) then
      raise exception 'missing_security_reference' using
        detail = 'Der Dividendeneingang ' || v_payment.payment_id ||
                 ' verweist auf ein Unternehmen, das in der Sicherung fehlt.';
    end if;

    if not v_payment.depot_id = any(v_depot_ids) then
      raise exception 'missing_depot_reference' using
        detail = 'Der Dividendeneingang ' || v_payment.payment_id ||
                 ' verweist auf ein Depot, das in der Sicherung fehlt.';
    end if;
  end loop;

  -- Hier lag der Fehler: `import_id`, nicht `id`.
  for v_import_id in
    select distinct (obj->>'import_id')::uuid
    from jsonb_array_elements(coalesce(p_data->'dividend_payments', '[]'::jsonb)) as x(obj)
    where obj->>'import_id' is not null
  loop
    if not v_import_id = any(v_import_ids) then
      raise exception 'missing_import_reference' using
        detail = 'Ein Dividendeneingang verweist auf den Importvorgang ' ||
                 v_import_id || ', der in der Sicherung fehlt.';
    end if;
  end loop;

  for v_goal in
    select obj->>'id' as goal_id, obj->>'goal_type' as goal_type
    from jsonb_array_elements(coalesce(p_data->'goals', '[]'::jsonb)) as x(obj)
  loop
    if v_goal.goal_type not in ('annual', 'monthly') then
      raise exception 'invalid_goal_type' using
        detail = 'Das Ziel ' || v_goal.goal_id || ' hat die unbekannte Art: ' ||
                 v_goal.goal_type;
    end if;
  end loop;
end;
$$ language plpgsql stable set search_path = public, extensions;
