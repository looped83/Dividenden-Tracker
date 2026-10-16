-- Gemeinsame Trigger-Funktionen (DATA_MODEL.md §4).

-- updated_at wird ausschliesslich hier gesetzt, nie vom Client.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Erzwingt user_id = auth.uid() bei INSERT (Defense in Depth zusaetzlich zur
-- RLS-Policy) und verbietet eine nachtraegliche Aenderung des Eigentuemers.
create or replace function enforce_user_id()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is null then
      new.user_id := auth.uid();
    elsif new.user_id is distinct from auth.uid() then
      raise exception 'user_id muss auth.uid() entsprechen' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id ist unveraenderlich' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Schreibt einen Diff der geaenderten fachlichen Felder nach audit_log
-- (SECURITY_MODEL.md §8). Technische Felder (id, Zeitstempel, Fingerprints)
-- werden nie protokolliert. tg_argv[0] = entity_type, tg_argv[1] = Name der
-- Eigentuemer-Spalte (Default 'user_id'; profiles nutzt 'id').
-- security definer: der Trigger-Eigentuemer (Migrationsrolle) besitzt die
-- Tabelle audit_log und umgeht damit deren RLS fuer den eigenen INSERT,
-- ohne dass der aufrufende Client dafuer Rechte auf audit_log braucht.
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
  v_new := to_jsonb(new);
  v_user_id := (v_new ->> v_user_id_column)::uuid;
  v_origin := coalesce(nullif(current_setting('app.audit_origin', true), ''), 'ui')::audit_origin;

  if tg_op = 'INSERT' then
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any(v_excluded)) then
        v_new_diff := v_new_diff || jsonb_build_object(v_key, v_new -> v_key);
      end if;
    end loop;

    insert into audit_log (user_id, entity_type, entity_id, action, old_values, new_values, origin)
    values (v_user_id, v_entity_type, new.id, 'insert', null, v_new_diff, v_origin);
    return new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
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
  end if;

  return null;
end;
$$;
