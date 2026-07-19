-- Erweiterungen und Enums (DATA_MODEL.md §2).
-- pgcrypto ist Supabase-Standard; gen_random_uuid() ist seit PostgreSQL 13
-- eingebaut, wird hier aber ueber pgcrypto konsistent mit Supabase-Projekten gehalten.
create extension if not exists pgcrypto;

create type payment_type as enum (
  'regular',
  'special',
  'correction',
  'cancellation',
  'refund',
  'other'
);

create type payment_source as enum ('manual', 'csv_import', 'excel_import', 'restore');

create type import_status as enum (
  'analyzing',
  'pending_confirmation',
  'committed',
  'rolled_back',
  'discarded'
);

create type data_quality as enum ('ok', 'incomplete', 'needs_review');

create type goal_type as enum (
  'net_year',
  'gross_year',
  'rolling_12m',
  'avg_month_net',
  'long_term'
);

create type audit_action as enum (
  'insert',
  'update',
  'archive',
  'unarchive',
  'import_commit',
  'import_rollback',
  'restore'
);

create type audit_origin as enum ('ui', 'import', 'rollback', 'restore', 'migration');
