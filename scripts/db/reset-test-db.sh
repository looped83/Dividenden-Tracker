#!/usr/bin/env bash
# Baut die lokale Test-Datenbank komplett neu auf: Datenbank neu anlegen,
# auth-Emulation (supabase/test-support) einspielen, anschliessend alle
# Migrationen aus supabase/migrations in Reihenfolge anwenden.
#
# Dies ist NICHT der Weg fuer ein echtes Supabase-Projekt (dort verwaltet
# `supabase db push`/`supabase migration up` bzw. die verwaltete Plattform
# das auth-Schema bereits selbst) — siehe DECISIONS.md D-027.
set -euo pipefail

DB_NAME="${TEST_DB_NAME:-dividend_tracker_test}"
DB_USER="${TEST_DB_USER:-postgres}"
DB_HOST="${TEST_DB_HOST:-127.0.0.1}"
DB_PORT="${TEST_DB_PORT:-5432}"
export PGPASSWORD="${TEST_DB_PASSWORD:-postgres}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
  -c "drop database if exists ${DB_NAME};" \
  -c "create database ${DB_NAME};"

psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f "$REPO_ROOT/supabase/test-support/local-postgres-bootstrap.sql"

for migration in "$REPO_ROOT"/supabase/migrations/*.sql; do
  echo "Wende Migration an: $(basename "$migration")"
  psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -f "$migration"
done

echo "Test-Datenbank ${DB_NAME} bereit."
