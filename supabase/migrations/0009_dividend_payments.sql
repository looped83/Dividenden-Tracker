-- Dividendeneingang: Kerntabelle (DATA_MODEL.md §3.5).
create table dividend_payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id),
  security_id          uuid not null references securities (id),
  depot_id             uuid not null references depots (id),

  pay_date             date not null check (pay_date between date '1970-01-01' and current_date),
  gross_amount         numeric(14, 2) not null,
  net_amount           numeric(14, 2) not null,
  withholding_tax      numeric(14, 2) not null default 0,
  domestic_tax         numeric(14, 2) not null default 0,
  solidarity_surcharge numeric(14, 2),
  church_tax           numeric(14, 2),
  fees                 numeric(14, 2),

  original_currency    char(3) not null check (original_currency ~ '^[A-Z]{3}$'),
  original_gross       numeric(18, 6),
  original_net         numeric(18, 6),
  fx_rate              numeric(18, 8) check (fx_rate > 0),

  quantity             numeric(18, 6) check (quantity > 0),
  amount_per_share     numeric(18, 8) check (amount_per_share >= 0),

  payment_type         payment_type not null default 'regular',
  source               payment_source not null,
  import_id            uuid references imports (id),
  source_file_name     text,
  source_row_number    int check (source_row_number >= 1),
  row_fingerprint      text,
  business_fingerprint text,

  note                 text check (length(note) <= 5000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz,
  archive_reason       text,

  constraint sign_consistency check (
    (payment_type in ('regular', 'special', 'refund', 'other') and gross_amount >= 0 and net_amount >= 0)
    or payment_type in ('correction', 'cancellation')
  ),
  constraint import_fields_consistency check (
    (source in ('csv_import', 'excel_import'))
    = (import_id is not null and source_row_number is not null and row_fingerprint is not null)
  ),
  constraint fx_fields_consistency check (
    (original_gross is null and original_net is null and fx_rate is null)
    or (original_gross is not null and original_net is not null and fx_rate is not null)
  ),
  -- Betragsinvariante mit Toleranz (CALCULATION_RULES.md §4).
  constraint net_amount_invariance check (
    gross_amount - withholding_tax - domestic_tax - coalesce(solidarity_surcharge, 0)
      - coalesce(church_tax, 0) - coalesce(fees, 0) - net_amount between -0.02 and 0.02
  )
);

create index dp_user_date_idx on dividend_payments (user_id, pay_date desc);
create index dp_user_security_idx on dividend_payments (user_id, security_id, pay_date desc);
create index dp_user_depot_idx on dividend_payments (user_id, depot_id, pay_date desc);
create index dp_user_import_idx on dividend_payments (user_id, import_id) where import_id is not null;
create index dp_business_fp_idx on dividend_payments (user_id, business_fingerprint);
create index dp_row_fp_idx on dividend_payments (user_id, row_fingerprint) where row_fingerprint is not null;
create index dp_active_idx on dividend_payments (user_id, pay_date desc) where archived_at is null;

-- Bewusst kein Unique Constraint auf business_fingerprint (DECISIONS.md D-007).
create unique index dp_import_row_key on dividend_payments (import_id, source_row_number)
  where import_id is not null;

alter table dividend_payments enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): kein DELETE (Soft Delete ueber
-- archive_payment()-RPC bzw. UPDATE), kein Zugriff fuer anon.
revoke all on dividend_payments from anon, authenticated;
grant select, insert, update on dividend_payments to authenticated;

create policy dividend_payments_select_own on dividend_payments
  for select
  to authenticated
  using (user_id = auth.uid());

create policy dividend_payments_insert_own on dividend_payments
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy dividend_payments_update_own on dividend_payments
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Kein DELETE: ausschliesslich Soft Delete ueber archive_payment()-RPC (Grundsatz 3).

-- Berechnet business_fingerprint serverseitig neu (CALCULATION_RULES.md §5) —
-- eine Wahrheit fuer Client-Vorpruefung und Datenbank.
create or replace function recompute_business_fingerprint()
returns trigger
language plpgsql
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

-- Verbietet die Aenderung unveraenderlicher Felder und jede weitere
-- Bearbeitung archivierter Zeilen ausser der Reaktivierung (DATA_MODEL.md §4).
create or replace function protect_payment_immutables()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.source is distinct from old.source
     or new.import_id is distinct from old.import_id
     or new.source_row_number is distinct from old.source_row_number
     or new.row_fingerprint is distinct from old.row_fingerprint
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Dieses Feld ist unveraenderlich' using errcode = '42501';
  end if;

  if old.archived_at is not null then
    if new.archived_at is not null then
      raise exception 'Archivierte Eingaenge duerfen nicht bearbeitet werden (nur Reaktivierung)'
        using errcode = '42501';
    end if;

    if (to_jsonb(new) - array['archived_at', 'archive_reason', 'updated_at', 'business_fingerprint'])
       is distinct from
       (to_jsonb(old) - array['archived_at', 'archive_reason', 'updated_at', 'business_fingerprint'])
    then
      raise exception 'Bei Reaktivierung duerfen keine weiteren Felder geaendert werden'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Reihenfolge der BEFORE-Trigger ist alphabetisch nach Name relevant:
-- 1) Unveraenderlichkeit pruefen, 2) Eigentuemer erzwingen,
-- 3) Fingerprint neu berechnen, 4) updated_at setzen.
create trigger trg_01_protect_immutables
  before update on dividend_payments
  for each row execute function protect_payment_immutables();

create trigger trg_02_enforce_user_id
  before insert or update on dividend_payments
  for each row execute function enforce_user_id();

create trigger trg_03_recompute_fingerprint
  before insert or update on dividend_payments
  for each row execute function recompute_business_fingerprint();

create trigger trg_04_updated_at
  before update on dividend_payments
  for each row execute function set_updated_at();

create trigger trg_dividend_payments_audit
  after insert or update on dividend_payments
  for each row execute function audit_row_change('dividend_payment');

-- Nachtrag zu 0004: Basiswaehrung ist nur aenderbar, solange keine
-- Dividendeneingaenge existieren (DECISIONS.md D-002). Kann erst hier
-- angelegt werden, da dividend_payments zuvor noch nicht existierte.
create or replace function guard_base_currency_change()
returns trigger
language plpgsql
as $$
begin
  if new.base_currency is distinct from old.base_currency then
    if exists (select 1 from dividend_payments where user_id = new.id) then
      raise exception 'Basiswaehrung kann nicht geaendert werden, solange Dividendeneingaenge vorhanden sind'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_guard_base_currency
  before update on profiles
  for each row execute function guard_base_currency_change();
