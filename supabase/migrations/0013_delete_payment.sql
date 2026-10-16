-- Eng begrenzte Ausnahme vom Hard-Delete-Verbot (Grundsatz 3, PRODUCT_SPEC.md
-- §3): Nutzer koennen einen Dividendeneingang endgueltig entfernen, aber
-- ausschliesslich nachdem er bereits archiviert wurde. Der verpflichtende
-- Archivierungsschritt sorgt dafuer, dass kein Eingang durch eine einzelne,
-- versehentliche Aktion aus einem aktiven Zustand heraus geloescht werden
-- kann; die Loeschung selbst wird weiterhin im Audit Log protokolliert
-- (Grundsatz 2), auch wenn sie nicht mehr rueckgaengig gemacht werden kann.
-- Damit als Vorbild fuer diese Ausnahme: die bereits bestehende, ebenso eng
-- begrenzte DELETE-Policy auf imports (0008_imports.sql, nur draft-Status).

-- Erweitert audit_row_change() (0003_helper_functions.sql) um den DELETE-Fall.
create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_type text := tg_argv[0];
  v_user_id_column text := coalesce(nullif(tg_argv[1], ''), 'user_id');
  v_excluded text[] := array[
    'id', 'user_id', 'created_at', 'updated_at',
    'row_fingerprint', 'business_fingerprint'
  ];
  v_old jsonb;
  v_new jsonb;
  v_old_diff jsonb := '{}'::jsonb;
  v_new_diff jsonb := '{}'::jsonb;
  v_key text;
  v_action audit_action;
  v_user_id uuid;
  v_origin audit_origin;
begin
  v_origin := coalesce(nullif(current_setting('app.audit_origin', true), ''), 'ui')::audit_origin;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_user_id := (v_new ->> v_user_id_column)::uuid;
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any(v_excluded)) then
        v_new_diff := v_new_diff || jsonb_build_object(v_key, v_new -> v_key);
      end if;
    end loop;

    insert into audit_log (user_id, entity_type, entity_id, action, old_values, new_values, origin)
    values (v_user_id, v_entity_type, new.id, 'insert', null, v_new_diff, v_origin);
    return new;
  elsif tg_op = 'UPDATE' then
    v_new := to_jsonb(new);
    v_old := to_jsonb(old);
    v_user_id := (v_new ->> v_user_id_column)::uuid;
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any(v_excluded)) and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_old_diff := v_old_diff || jsonb_build_object(v_key, v_old -> v_key);
        v_new_diff := v_new_diff || jsonb_build_object(v_key, v_new -> v_key);
      end if;
    end loop;

    if v_old_diff = '{}'::jsonb then
      -- keine fachliche Aenderung (z. B. nur ein technisches Feld) -> kein Eintrag
      return new;
    end if;

    if (v_old ->> 'archived_at') is null and (v_new ->> 'archived_at') is not null then
      v_action := 'archive';
    elsif (v_old ->> 'archived_at') is not null and (v_new ->> 'archived_at') is null then
      v_action := 'unarchive';
    else
      v_action := 'update';
    end if;

    insert into audit_log (user_id, entity_type, entity_id, action, old_values, new_values, origin)
    values (v_user_id, v_entity_type, new.id, v_action, v_old_diff, v_new_diff, v_origin);
    return new;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_user_id := (v_old ->> v_user_id_column)::uuid;
    for v_key in select jsonb_object_keys(v_old) loop
      if not (v_key = any(v_excluded)) then
        v_old_diff := v_old_diff || jsonb_build_object(v_key, v_old -> v_key);
      end if;
    end loop;

    insert into audit_log (user_id, entity_type, entity_id, action, old_values, new_values, origin)
    values (v_user_id, v_entity_type, old.id, 'delete', v_old_diff, null, v_origin);
    return old;
  end if;

  return null;
end;
$$;

grant delete on dividend_payments to authenticated;

create policy dividend_payments_delete_archived_own on dividend_payments
  for delete
  to authenticated
  using (user_id = auth.uid() and archived_at is not null);

-- Trigger muss neu angelegt werden, um das DELETE-Ereignis mit aufzunehmen
-- (CREATE OR REPLACE TRIGGER aendert keine Ereignisliste).
drop trigger if exists trg_dividend_payments_audit on dividend_payments;
create trigger trg_dividend_payments_audit
  after insert or update or delete on dividend_payments
  for each row execute function audit_row_change('dividend_payment');
