-- Behebt "function digest(text, unknown) does not exist" beim Archivieren
-- eines Dividendeneingangs auf dem echten Supabase-Projekt.
--
-- Ursache: Supabase installiert pgcrypto standardmaessig in das Schema
-- `extensions`, nicht in `public`. `recompute_business_fingerprint()`
-- (0009_dividend_payments.sql) ruft `digest()` auf, hatte aber selbst keinen
-- fest gepinnten `search_path` und erbte daher den des jeweiligen Aufrufers.
-- Ein direktes UPDATE ueber PostgREST (z. B. beim Bearbeiten oder
-- Reaktivieren) funktioniert, weil die API-Verbindung `extensions` per
-- Default im `search_path` fuehrt — die RPC `archive_payment()`
-- (0011_archive_payment_rpc.sql) setzt jedoch explizit `search_path = public`
-- fuer sich selbst, und dieser engere Pfad gilt dann auch fuer den darin
-- ausgeloesten BEFORE-Trigger, wodurch `digest()` dort unauffindbar wird.
--
-- Fix: `recompute_business_fingerprint()` bekommt einen eigenen, robusten
-- `search_path`, der unabhaengig vom Aufrufer immer greift. `archive_payment()`
-- wird zusaetzlich auf denselben `search_path` erweitert (Verteidigung in
-- der Tiefe, falls die RPC kuenftig selbst eine Extension-Funktion nutzt).
-- Schemata, die in einer Umgebung nicht existieren (z. B. `extensions` in
-- der lokalen Test-Datenbank), werden von Postgres beim Namensaufloesen
-- einfach uebersprungen — kein Fehler, wenn ein Eintrag im `search_path`
-- fehlt.
create or replace function recompute_business_fingerprint()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_isin text;
  v_ticker text;
  v_name text;
  v_security_key text;
  v_payload text;
begin
  select isin, ticker, name into v_isin, v_ticker, v_name
  from securities
  where id = new.security_id;

  if not found then
    raise exception 'security_id % nicht gefunden', new.security_id;
  end if;

  v_security_key := coalesce(
    v_isin,
    v_ticker,
    lower(regexp_replace(trim(normalize(v_name, nfc)), '\s+', ' ', 'g'))
  );

  v_payload := concat_ws(
    chr(31),
    new.user_id::text,
    new.pay_date::text,
    v_security_key,
    new.net_amount::text,
    new.original_currency,
    new.depot_id::text
  );

  new.business_fingerprint := encode(digest(v_payload, 'sha256'), 'hex');
  return new;
end;
$$;

create or replace function archive_payment(p_id uuid, p_reason text default null)
returns dividend_payments
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_row dividend_payments;
begin
  update dividend_payments
  set archived_at = now(), archive_reason = p_reason
  where id = p_id
    and user_id = auth.uid()
    and archived_at is null
  returning * into v_row;

  if not found then
    raise exception 'Eingang nicht gefunden, bereits archiviert oder keine Berechtigung'
      using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;
