# Integration Tests & PostgreSQL Setup Guide

**Status**: 🔴 Integration tests NOT YET RUN (PostgreSQL unavailable in current environment)

---

## What Tests Need to Run

### Phase 9 Hard Precondition: RLS (Row-Level Security) Verification

**57 tests** across 3 suites must execute and pass:

```
tests/integration/
├── rls.test.ts                    (19 tests)
├── constraints.test.ts             (21 tests)
├── triggers.test.ts                (16 tests)
└── backup/
    ├── restore-atomicity.test.ts   (32 scenarios documented)
    └── rls-enforcement.test.ts     (30 scenarios documented)
```

These tests verify:
- ✅ Multi-user isolation (User A cannot read/write User B's data)
- ✅ Constraint enforcement (financial data integrity)
- ✅ Trigger correctness (audit log, timestamps)
- ✅ Backup atomicity (all-or-nothing restore)
- ✅ RLS policy coverage (all 23 tables)

**Critical for release:** Without these tests passing, multi-user isolation is unproven. For a financial app, this is non-negotiable.

---

## Prerequisites

### Option A: Docker + Supabase CLI (Recommended)

**Requirements:**
- Docker daemon running
- Supabase CLI installed
- ~5 GB disk space for containers

**Setup (5 minutes):**

```bash
# 1. Install Supabase CLI (if not already installed)
brew install supabase/tap/supabase    # macOS
# or
npm install -g supabase              # any platform

# 2. Start Supabase local environment
cd /path/to/Dividenden-Tracker
supabase start

# Output should show:
# API URL: http://localhost:54321
# DB URL: postgresql://postgres:postgres@127.0.0.1:5432/postgres
# Anon Key: [key]

# 3. Run tests
npm run test:integration

# Expected output:
# Test Files  3 passed (3)
# Tests       57 passed (57)
```

**Stopping Supabase:**
```bash
supabase stop
```

### Option B: Manual PostgreSQL (Advanced)

**Requirements:**
- PostgreSQL 15+ installed and running
- createdb, psql commands available

**Setup:**

```bash
# 1. Create test database
createdb dividend_tracker_test

# 2. Set connection string
export DATABASE_URL="postgresql://postgres@127.0.0.1:5432/dividend_tracker_test"

# 3. Apply migrations
npx supabase db push --db-url "$DATABASE_URL"

# 4. Run tests
npm run test:integration
```

### Option C: Remote Database (CI/CD)

Use an online PostgreSQL provider (Render, Railway, etc.):

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/db"
npm run test:integration
```

---

## Running the Tests

### Quick Start (assumes Supabase already running)

```bash
npm run test:integration
```

### Full Output

```bash
npm run test:integration 2>&1 | tee integration-test-results.log
```

### Single Test File

```bash
npx vitest run --config vitest.integration.config.ts tests/integration/rls.test.ts
```

---

## Expected Results

### ✅ Success Criteria

```
Test Files  3 passed (3)
Tests       57 passed (57)
Duration    ~30-60 seconds
```

All 57 tests must pass. No skipped tests. No failures.

### 🔴 Failure Diagnosis

**Common issues:**

| Error | Cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | Database not running | `supabase start` or check PostgreSQL |
| `Role "anon" does not exist` | Migrations not applied | `supabase db push` |
| `permission denied for schema public` | RLS issue in migration | Re-run migrations in order |
| `Tests timeout after 30s` | Query too slow | Check indices, run ANALYZE |

### Debugging

```bash
# Check database connection
psql -d postgresql://postgres:postgres@127.0.0.1:5432/postgres -c "SELECT version();"

# Check migrations applied
psql -d dividend_tracker_test -c "\dt"

# Run single test with verbose output
npx vitest run --config vitest.integration.config.ts tests/integration/rls.test.ts --reporter=verbose
```

---

## What Gets Tested

### RLS Tests (`rls.test.ts` — 19 tests)

**Multi-User Isolation:**
- User A's payments not readable by User B
- User A's payments not updatable by User B
- User A's payments not deletable by User B
- User A cannot create payments for User B
- User A cannot read/write User B's securities, depots, goals

**Test Pattern:**
```typescript
// Create payment as User A
await withUser(userA, () => createPayment(…))

// Attempt to read as User B (should fail)
await withUser(userB, () => readPayment(paymentId)) // RLS blocks
```

### Constraint Tests (`constraints.test.ts` — 21 tests)

**Financial Data Integrity:**
- `pay_date` must be in past (not future)
- `net_amount = gross_amount - taxes ± 0.02`
- `quantity > 0` (positive shares only)
- Foreign key constraints (security_id exists, depot_id valid)
- Unique constraints (one goal per year/month)

### Trigger Tests (`triggers.test.ts` — 16 tests)

**Automatic Behaviors:**
- `updated_at` timestamp on UPDATE
- `created_at` timestamp on INSERT (immutable)
- Audit log entry created on INSERT/UPDATE/DELETE
- `user_id` enforced by trigger (can't spoof it)

### Backup Atomicity Tests (documented scenarios)

**All-or-Nothing Restore:**
- Restore succeeds → all data present
- Restore fails mid-transaction → old data unchanged
- Restore conflict handling → documented outcome

---

## Current Environment Status

| Component | Status | Action |
|---|---|---|
| Docker | ✅ Installed | ❌ Daemon not running |
| Supabase CLI | ❌ Not found | Install via `brew install supabase/tap/supabase` |
| PostgreSQL | ❌ Port 5432 refused | Start database or use Supabase |
| Tests | 📝 Ready to run | Blocked on database |

---

## Release Checklist

- [ ] PostgreSQL running (local, Docker, or remote)
- [ ] Migrations applied (`supabase db push` or equivalent)
- [ ] `npm run test:integration` passes all 57 tests
- [ ] `npm run test` passes all 373 unit tests (sanity check)
- [ ] Deployment environment secrets verified
- [ ] Manual smoke test on staging/production

---

## Documentation

- Test code: `tests/integration/`
- Test configuration: `vitest.integration.config.ts`
- Helpers: `tests/integration/helpers.ts`
- Database migrations: `supabase/migrations/`

For detailed test code, see individual `*.test.ts` files.

---

## Next Steps

### To Unblock This Environment

**Option 1: Start Docker + Supabase (easiest)**
```bash
# In another terminal, start Docker
sudo systemctl start docker    # Linux
# or
open -a Docker                 # macOS (GUI)

# Then run
supabase start
npm run test:integration
```

**Option 2: Use Remote Database**
```bash
# Set env var to remote PostgreSQL
export DATABASE_URL="postgresql://user:pass@host:5432/db"
npm run test:integration
```

**Option 3: Skip for Now, Run in CI/CD**
The integration test suite will run automatically in your CI/CD pipeline (GitHub Actions, etc.) where Docker is available. For manual verification before release, use Option 1 or 2.

---

## Why This Matters for Release

**Without passing integration tests:**
- RLS is documented but unverified
- Multi-user isolation is unproven
- Constraint violations might not be caught
- Backup restore could lose data silently
- **Release is not safe** 🔴

**With passing integration tests:**
- RLS verified across all 23 tables ✅
- Multi-user isolation confirmed ✅
- Financial constraints enforced ✅
- Restore atomicity guaranteed ✅
- **Release is safe** 🟢

---

**Current Status:** 🔴 Blocked on PostgreSQL availability  
**Priority:** 🔴 Critical (hard release precondition)  
**Estimated Duration:** 5 min setup + 1 min tests

---

_Last Updated: 2026-07-27 · Phase 9 Audit_
