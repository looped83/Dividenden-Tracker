#!/bin/bash

###############################################################################
# Phase 8 Migration Deployment Helper
#
# Usage:
#   ./scripts/deploy-migration.sh [method]
#
# Methods:
#   - supabase-cli  (default): Use Supabase CLI (requires supabase login)
#   - psql          : Use direct psql connection (requires DATABASE_URL env)
#   - verify-only   : Only verify migration, don't deploy
#   - status        : Check deployment status
#
###############################################################################

set -e

MIGRATION_FILE="supabase/migrations/0022_restore_backup_rpc.sql"
METHOD="${1:-supabase-cli}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Verify migration file exists
if [[ ! -f "$MIGRATION_FILE" ]]; then
  echo_error "Migration file not found: $MIGRATION_FILE"
  exit 1
fi

case "$METHOD" in
  supabase-cli)
    echo_info "Deploying via Supabase CLI..."

    if ! command -v supabase &> /dev/null; then
      echo_error "Supabase CLI not found. Install with: brew install supabase/tap/supabase"
      exit 1
    fi

    echo_info "Running: supabase migration up"
    supabase migration up

    echo_info "Generating TypeScript types..."
    npm run gen:types

    echo_info "✅ Deployment complete!"
    echo_info "Next: Run integration tests with 'npm run test:integration'"
    ;;

  psql)
    echo_info "Deploying via psql..."

    if [[ -z "$DATABASE_URL" ]]; then
      echo_error "DATABASE_URL environment variable not set"
      echo_warn "Set it with: export DATABASE_URL='postgresql://user:pass@host:5432/dbname'"
      exit 1
    fi

    if ! command -v psql &> /dev/null; then
      echo_error "psql client not found"
      exit 1
    fi

    echo_info "Deploying migration to $DATABASE_URL..."
    psql "$DATABASE_URL" < "$MIGRATION_FILE"

    echo_info "Generating TypeScript types..."
    npm run gen:types

    echo_info "✅ Deployment complete!"
    ;;

  verify-only)
    echo_info "Verifying migration file syntax..."

    # Basic SQL syntax check
    if grep -q "^create or replace function restore_backup" "$MIGRATION_FILE"; then
      echo_info "✅ restore_backup function definition found"
    else
      echo_error "restore_backup function definition not found"
      exit 1
    fi

    if grep -q "validate_backup_version" "$MIGRATION_FILE"; then
      echo_info "✅ validate_backup_version function found"
    fi

    if grep -q "validate_backup_schema" "$MIGRATION_FILE"; then
      echo_info "✅ validate_backup_schema function found"
    fi

    if grep -q "validate_backup_currency" "$MIGRATION_FILE"; then
      echo_info "✅ validate_backup_currency function found"
    fi

    if grep -q "validate_backup_references" "$MIGRATION_FILE"; then
      echo_info "✅ validate_backup_references function found"
    fi

    echo_info "Migration file is valid"
    echo_info "File size: $(wc -c < "$MIGRATION_FILE") bytes"
    echo_info "Lines: $(wc -l < "$MIGRATION_FILE")"
    ;;

  status)
    echo_info "Checking deployment status..."

    if [[ -z "$DATABASE_URL" ]]; then
      echo_error "DATABASE_URL not set. Cannot check status."
      exit 1
    fi

    if ! command -v psql &> /dev/null; then
      echo_error "psql client not found"
      exit 1
    fi

    echo_info "Connected to database. Checking for functions..."

    psql "$DATABASE_URL" -c "
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_name LIKE 'restore_backup%' OR routine_name LIKE 'validate_backup%'
      ORDER BY routine_name;
    " || echo_warn "Could not query functions"
    ;;

  *)
    echo_error "Unknown method: $METHOD"
    echo ""
    echo "Usage: $0 [method]"
    echo ""
    echo "Methods:"
    echo "  supabase-cli  - Deploy via Supabase CLI (default)"
    echo "  psql          - Deploy via direct psql connection"
    echo "  verify-only   - Verify migration syntax"
    echo "  status        - Check deployment status"
    exit 1
    ;;
esac
