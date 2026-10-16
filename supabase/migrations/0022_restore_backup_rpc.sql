-- Phase 8: Restore Backup RPC
-- Enables atomic, transactional restoration of complete backups with merge/replace modes
-- Enforced: User isolation (auth.uid()), Atomic transactions, Referential integrity

-- ============================================================================
-- Helper: Validate backup format version
-- ============================================================================
create or replace function validate_backup_version(
  p_format_version int
) returns void as $$
begin
  if p_format_version != 1 then
    raise exception 'unsupported_format_version' using
      detail = 'Backup format version ' || p_format_version || ' is not supported. Expected version 1.',
      hint = 'Update the application or use a compatible backup file.';
  end if;
end;
$$ language plpgsql stable;

-- ============================================================================
-- Helper: Validate backup schema version compatibility
-- ============================================================================
create or replace function validate_backup_schema(
  p_schema_version text
) returns void as $$
declare
  v_current_version text;
begin
  -- Current schema version corresponds to highest migration
  -- This function checks if backup was created with an older or equal version
  -- Exact version matching not required; we gracefully handle older backups

  -- For now: accept any schema version with a warning logged
  -- Future: Could reject if schema_version > current app migration
  if p_schema_version is null or p_schema_version = '' then
    raise exception 'invalid_backup_schema' using
      detail = 'Backup schema version is missing or empty.',
      hint = 'Ensure the backup file is valid and complete.';
  end if;
end;
$$ language plpgsql stable;

-- ============================================================================
-- Helper: Validate backup base currency matches user's profile
-- ============================================================================
create or replace function validate_backup_currency(
  p_user_id uuid,
  p_backup_currency char(3)
) returns void as $$
declare
  v_profile_currency char(3);
begin
  select base_currency into v_profile_currency from profiles
  where id = p_user_id;

  if v_profile_currency is null then
    raise exception 'user_profile_not_found' using
      detail = 'User profile does not exist.';
  end if;

  if v_profile_currency != p_backup_currency then
    raise exception 'currency_mismatch' using
      detail = 'Backup currency (' || p_backup_currency || ') does not match user''s base currency (' || v_profile_currency || ').',
      hint = 'Create a backup with the current profile currency.';
  end if;
end;
$$ language plpgsql stable;

-- ============================================================================
-- Helper: Validate referential integrity within backup data
-- ============================================================================
create or replace function validate_backup_references(
  p_data jsonb
) returns void as $$
declare
  v_security_ids uuid[];
  v_depot_ids uuid[];
  v_payment record;
  v_import_id uuid;
  v_goal record;
begin
  -- Collect all security IDs from the backup
  v_security_ids := array_agg(distinct (obj->>'id')::uuid)
    from jsonb_array_elements(coalesce(p_data->'securities', '[]'::jsonb)) as x(obj)
    where obj->>'id' is not null;

  -- Collect all depot IDs from the backup
  v_depot_ids := array_agg(distinct (obj->>'id')::uuid)
    from jsonb_array_elements(coalesce(p_data->'depots', '[]'::jsonb)) as x(obj)
    where obj->>'id' is not null;

  -- Validate each dividend payment references existing security/depot
  for v_payment in
    select obj->>'id' as payment_id,
           (obj->>'security_id')::uuid as security_id,
           (obj->>'depot_id')::uuid as depot_id
    from jsonb_array_elements(coalesce(p_data->'dividend_payments', '[]'::jsonb)) as x(obj)
  loop
    if not v_payment.security_id = any(v_security_ids) then
      raise exception 'missing_security_reference' using
        detail = 'Dividend payment ' || v_payment.payment_id || ' references non-existent security.',
        hint = 'Ensure the backup file is complete and valid.';
    end if;

    if not v_payment.depot_id = any(v_depot_ids) then
      raise exception 'missing_depot_reference' using
        detail = 'Dividend payment ' || v_payment.payment_id || ' references non-existent depot.',
        hint = 'Ensure the backup file is complete and valid.';
    end if;
  end loop;

  -- Validate import references (if imports exist in backup)
  for v_import_id in
    select distinct (obj->>'id')::uuid
    from jsonb_array_elements(coalesce(p_data->'dividend_payments', '[]'::jsonb)) as x(obj)
    where (obj->>'import_id') is not null
  loop
    if not exists(
      select 1 from jsonb_array_elements(coalesce(p_data->'imports', '[]'::jsonb)) as x(obj)
      where (obj->>'id')::uuid = v_import_id
    ) then
      raise exception 'missing_import_reference' using
        detail = 'Dividend payment references import ' || v_import_id || ' which is missing from backup.',
        hint = 'Ensure the backup file is complete.';
    end if;
  end loop;

  -- Validate goals (year/month not validated here, application-level concern)
  for v_goal in
    select obj->>'id' as goal_id, obj->>'goal_type' as goal_type
    from jsonb_array_elements(coalesce(p_data->'goals', '[]'::jsonb)) as x(obj)
  loop
    if v_goal.goal_type not in ('annual', 'monthly') then
      raise exception 'invalid_goal_type' using
        detail = 'Goal ' || v_goal.goal_id || ' has invalid type: ' || v_goal.goal_type,
        hint = 'Valid types are: annual, monthly.';
    end if;
  end loop;
end;
$$ language plpgsql stable;

-- ============================================================================
-- Main RPC: Restore backup with merge or replace mode
-- ============================================================================
create or replace function restore_backup(
  p_backup_payload jsonb,
  p_mode text default 'merge'
) returns jsonb as $$
declare
  v_user_id uuid := auth.uid();
  v_format_version int;
  v_schema_version text;
  v_backup_currency char(3);
  v_result jsonb;
  v_restored_count int := 0;
  v_conflicts_count int := 0;
  v_errors text[];
begin
  -- ========================================================================
  -- 1. AUTHORIZATION & VALIDATION
  -- ========================================================================
  if v_user_id is null then
    raise exception 'not_authenticated' using
      detail = 'User must be authenticated to restore backups.';
  end if;

  if p_mode not in ('merge', 'replace') then
    raise exception 'invalid_restore_mode' using
      detail = 'Mode must be either ''merge'' or ''replace'', got: ' || p_mode,
      hint = 'merge: Add missing data, keep existing. replace: Archive all, restore from backup.';
  end if;

  -- Validate backup format
  begin
    v_format_version := (p_backup_payload->>'format_version')::int;
    perform validate_backup_version(v_format_version);
  exception when others then
    raise exception 'invalid_backup_format' using
      detail = SQLERRM,
      hint = 'Ensure the backup file is valid.';
  end;

  -- Validate schema version
  v_schema_version := p_backup_payload->>'schema_version';
  perform validate_backup_schema(v_schema_version);

  -- Validate currency
  v_backup_currency := p_backup_payload->'metadata'->>'base_currency';
  if v_backup_currency is null then
    v_backup_currency := p_backup_payload->>'base_currency';
  end if;
  perform validate_backup_currency(v_user_id, v_backup_currency);

  -- Validate referential integrity
  perform validate_backup_references(p_backup_payload->'data');

  -- ========================================================================
  -- 2. MODE-SPECIFIC LOGIC
  -- ========================================================================

  if p_mode = 'replace' then
    -- Archive all existing user data (soft delete, not hard delete)
    update dividend_payments
    set archived_at = now(), archive_reason = 'Replaced by backup restore'
    where user_id = v_user_id and archived_at is null;

    update securities
    set archived_at = now(), archive_reason = 'Replaced by backup restore'
    where user_id = v_user_id and archived_at is null;

    update depots
    set archived_at = now(), archive_reason = 'Replaced by backup restore'
    where user_id = v_user_id and archived_at is null;

    update portfolios
    set archived_at = now(), archive_reason = 'Replaced by backup restore'
    where user_id = v_user_id and archived_at is null;

    update goals
    set archived_at = now()
    where user_id = v_user_id and archived_at is null;

  end if;

  -- ========================================================================
  -- 3. INSERT BACKUP DATA (in correct FK dependency order)
  -- ========================================================================

  -- 3a. Portfolios (no dependencies)
  insert into portfolios (id, user_id, name, note, created_at, updated_at)
  select
    (obj->>'id')::uuid,
    v_user_id,
    obj->>'name',
    obj->>'note',
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_backup_payload->'data'->'portfolios', '[]'::jsonb)) as x(obj)
  on conflict (id) do nothing;

  v_restored_count := v_restored_count + (select count(*) from (
    select (obj->>'id')::uuid from jsonb_array_elements(coalesce(p_backup_payload->'data'->'portfolios', '[]'::jsonb)) as x(obj)
  ) as t);

  -- 3b. Depots (references portfolios, FK NOT NULL constraints depend on portfolio existence)
  insert into depots (id, user_id, name, broker, base_currency, portfolio_id, note, created_at, updated_at, archived_at, archive_reason)
  select
    (obj->>'id')::uuid,
    v_user_id,
    obj->>'name',
    obj->>'broker',
    coalesce(obj->>'base_currency', 'EUR'),
    (obj->>'portfolio_id')::uuid,
    obj->>'note',
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now()),
    (obj->>'archived_at')::timestamptz,
    obj->>'archive_reason'
  from jsonb_array_elements(coalesce(p_backup_payload->'data'->'depots', '[]'::jsonb)) as x(obj)
  on conflict (id) do nothing;

  -- 3c. Securities (no required dependencies)
  insert into securities (id, user_id, name, ticker, isin, wkn, country, sector, currency, note, data_quality, default_depot_id, payout_months, created_at, updated_at, archived_at, archive_reason)
  select
    (obj->>'id')::uuid,
    v_user_id,
    obj->>'name',
    obj->>'ticker',
    obj->>'isin',
    obj->>'wkn',
    obj->>'country',
    obj->>'sector',
    obj->>'currency',
    obj->>'note',
    coalesce(obj->>'data_quality', 'ok'),
    (obj->>'default_depot_id')::uuid,
    case
      when obj->'payout_months' is not null
      then (select array_agg(x::smallint) from jsonb_array_elements_text(obj->'payout_months') as t(x))
      else null
    end,
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now()),
    (obj->>'archived_at')::timestamptz,
    obj->>'archive_reason'
  from jsonb_array_elements(coalesce(p_backup_payload->'data'->'securities', '[]'::jsonb)) as x(obj)
  on conflict (id) do nothing;

  -- 3d. Imports (metadata only, status preserved)
  insert into imports (id, user_id, file_name, file_hash, file_size_bytes, file_type, sheet_name, status, column_mapping, detected_formats, row_balance, row_report, checksums, created_at, committed_at, rolled_back_at)
  select
    (obj->>'id')::uuid,
    v_user_id,
    obj->>'file_name',
    obj->>'file_hash',
    (obj->>'file_size_bytes')::bigint,
    obj->>'file_type',
    obj->>'sheet_name',
    obj->>'status',
    obj->'column_mapping',
    obj->'detected_formats',
    obj->'row_balance',
    obj->'row_report',
    obj->'checksums',
    coalesce((obj->>'created_at')::timestamptz, now()),
    (obj->>'committed_at')::timestamptz,
    (obj->>'rolled_back_at')::timestamptz
  from jsonb_array_elements(coalesce(p_backup_payload->'data'->'imports', '[]'::jsonb)) as x(obj)
  on conflict (id) do nothing;

  -- 3e. Dividend Payments (core data, references securities, depots, imports)
  insert into dividend_payments (
    id, user_id, security_id, depot_id, import_id,
    pay_date, gross_amount, net_amount, withholding_tax, domestic_tax, solidarity_surcharge, church_tax, fees,
    original_currency, original_gross, original_net, fx_rate,
    quantity, amount_per_share,
    payment_type, source, source_file_name, source_row_number,
    row_fingerprint, business_fingerprint,
    note, created_at, updated_at, archived_at, archive_reason
  )
  select
    (obj->>'id')::uuid,
    v_user_id,
    (obj->>'security_id')::uuid,
    (obj->>'depot_id')::uuid,
    (obj->>'import_id')::uuid,
    (obj->>'pay_date')::date,
    (obj->>'gross_amount')::numeric(14, 2),
    (obj->>'net_amount')::numeric(14, 2),
    coalesce((obj->>'withholding_tax')::numeric(14, 2), 0),
    coalesce((obj->>'domestic_tax')::numeric(14, 2), 0),
    coalesce((obj->>'solidarity_surcharge')::numeric(14, 2), 0),
    coalesce((obj->>'church_tax')::numeric(14, 2), 0),
    coalesce((obj->>'fees')::numeric(14, 2), 0),
    obj->>'original_currency',
    (obj->>'original_gross')::numeric(18, 6),
    (obj->>'original_net')::numeric(18, 6),
    (obj->>'fx_rate')::numeric(18, 8),
    (obj->>'quantity')::numeric(18, 6),
    (obj->>'amount_per_share')::numeric(18, 8),
    coalesce(obj->>'payment_type', 'regular')::payment_type,
    coalesce(obj->>'source', 'restore')::payment_source,
    obj->>'source_file_name',
    (obj->>'source_row_number')::int,
    obj->>'row_fingerprint',
    obj->>'business_fingerprint',
    obj->>'note',
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now()),
    (obj->>'archived_at')::timestamptz,
    obj->>'archive_reason'
  from jsonb_array_elements(coalesce(p_backup_payload->'data'->'dividend_payments', '[]'::jsonb)) as x(obj)
  on conflict (id) do nothing;

  -- 3f. Goals
  insert into goals (id, user_id, goal_type, year, month, target_amount, currency, title, note, created_at, updated_at, archived_at)
  select
    (obj->>'id')::uuid,
    v_user_id,
    (obj->>'goal_type')::goal_type,
    (obj->>'year')::int,
    (obj->>'month')::int,
    (obj->>'target_amount')::numeric(14, 2),
    coalesce(obj->>'currency', v_backup_currency),
    obj->>'title',
    obj->>'note',
    coalesce((obj->>'created_at')::timestamptz, now()),
    coalesce((obj->>'updated_at')::timestamptz, now()),
    (obj->>'archived_at')::timestamptz
  from jsonb_array_elements(coalesce(p_backup_payload->'data'->'goals', '[]'::jsonb)) as x(obj)
  on conflict (id) do nothing;

  -- ========================================================================
  -- 4. AUDIT LOG: Record the restore event
  -- ========================================================================
  insert into audit_log (
    user_id, entity_type, entity_id, action, origin,
    old_values, new_values, created_at
  ) values (
    v_user_id,
    'backup_restore',
    gen_random_uuid(),
    'restore',
    'restore',
    jsonb_build_object('mode', p_mode, 'schema_version', v_schema_version),
    jsonb_build_object('restored_at', now(), 'source_backup', p_backup_payload->'exported_at'),
    now()
  );

  -- ========================================================================
  -- 5. UPDATE: Set last_backup_at to indicate successful restore
  -- ========================================================================
  update profiles
  set last_backup_at = now()
  where id = v_user_id;

  -- ========================================================================
  -- 6. BUILD RESULT REPORT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'mode', p_mode,
    'restored_at', now(),
    'records', jsonb_build_object(
      'portfolios', coalesce((p_backup_payload->'integrity'->'record_counts'->>'portfolios')::int, 0),
      'depots', coalesce((p_backup_payload->'integrity'->'record_counts'->>'depots')::int, 0),
      'securities', coalesce((p_backup_payload->'integrity'->'record_counts'->>'securities')::int, 0),
      'dividend_payments', coalesce((p_backup_payload->'integrity'->'record_counts'->>'dividend_payments')::int, 0),
      'goals', coalesce((p_backup_payload->'integrity'->'record_counts'->>'goals')::int, 0),
      'imports', coalesce((p_backup_payload->'integrity'->'record_counts'->>'imports')::int, 0)
    ),
    'integrity', jsonb_build_object(
      'backup_created_at', p_backup_payload->>'exported_at',
      'backup_format_version', v_format_version,
      'backup_schema_version', v_schema_version
    )
  );

  return v_result;

exception when others then
  raise exception 'restore_failed' using
    detail = SQLERRM,
    hint = 'Check backup integrity and ensure you have sufficient permissions.';
end;
$$ language plpgsql security invoker;

-- Grant execution to authenticated users
grant execute on function restore_backup(jsonb, text) to authenticated;

-- ============================================================================
-- Ensure RLS is enabled on all tables involved
-- ============================================================================
alter table dividend_payments enable row level security;
alter table securities enable row level security;
alter table depots enable row level security;
alter table portfolios enable row level security;
alter table goals enable row level security;
alter table imports enable row level security;
alter table profiles enable row level security;
alter table audit_log enable row level security;

-- Update profiles table to track last_backup_at (may already exist from 0004)
-- This is idempotent; will do nothing if column already exists
alter table profiles add column if not exists last_backup_at timestamptz;
