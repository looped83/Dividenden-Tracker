# Phase 8 Deployment Guide

## PostgreSQL Migration Deployment

### Overview
Migration `0022_restore_backup_rpc.sql` adds the `restore_backup()` RPC function for atomic backup restoration with merge/replace modes.

### Prerequisites
- PostgreSQL 13+ (Supabase default)
- superuser or migration role permissions
- Test database for staging

### Deployment Steps

#### 1. **Staging Environment**
```bash
# Connect to test database
psql postgresql://user:password@test-db-url/test_db

# Run migration
\i supabase/migrations/0022_restore_backup_rpc.sql

# Verify RPC functions created
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name LIKE 'validate_backup_%' OR routine_name = 'restore_backup'
ORDER BY routine_name;
```

Expected output:
```
           routine_name            | routine_type
-----------------------------------+--------------
 restore_backup                    | FUNCTION
 validate_backup_currency          | FUNCTION
 validate_backup_references        | FUNCTION
 validate_backup_schema            | FUNCTION
 validate_backup_version           | FUNCTION
```

#### 2. **Test the RPC**
```bash
# Create test user
INSERT INTO profiles (id, email, base_currency) 
VALUES ('test-user-id', 'test@example.com', 'EUR');

# Create minimal backup JSON
cat > test_backup.json << 'BACKUP'
{
  "format": "dividend-tracker-backup",
  "format_version": 1,
  "schema_version": "0022",
  "base_currency": "EUR",
  "data": {
    "portfolios": [],
    "depots": [],
    "securities": [],
    "dividend_payments": [],
    "goals": [],
    "imports": []
  },
  "integrity": {
    "record_counts": {
      "portfolios": 0,
      "depots": 0,
      "securities": 0,
      "dividend_payments": 0,
      "goals": 0,
      "imports": 0
    }
  }
}
BACKUP

# Test RPC call (as authenticated user)
SELECT restore_backup('test_backup'::jsonb, 'merge');
```

#### 3. **Production Deployment**

**Option A: Supabase Dashboard**
1. Go to SQL Editor → New Query
2. Copy-paste contents of `0022_restore_backup_rpc.sql`
3. Click "Run"
4. Verify functions created in Database → Functions

**Option B: CLI (if Supabase CLI installed)**
```bash
supabase migration up
```

**Option C: Direct PostgreSQL (if direct access available)**
```bash
psql $DATABASE_URL < supabase/migrations/0022_restore_backup_rpc.sql
```

### Verification Checklist

After deployment, verify:

```sql
-- 1. Functions exist
\df restore_backup
\df validate_backup_*

-- 2. Functions are SECURITY DEFINER
SELECT routine_name, security_type 
FROM information_schema.routines 
WHERE routine_name = 'restore_backup';

-- 3. Test with empty backup (should succeed)
SELECT restore_backup(
  '{"format":"dividend-tracker-backup","format_version":1,"schema_version":"0022","base_currency":"EUR","data":{"portfolios":[],"depots":[],"securities":[],"dividend_payments":[],"goals":[],"imports":[]},"integrity":{"record_counts":{}}}'::jsonb,
  'merge'
);

-- 4. RLS policies active
SELECT * FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;
```

### Rollback Plan

If deployment fails:
```sql
-- Drop the functions (and associated helpers)
DROP FUNCTION IF EXISTS restore_backup(jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS validate_backup_currency(uuid, char) CASCADE;
DROP FUNCTION IF EXISTS validate_backup_references(jsonb) CASCADE;
DROP FUNCTION IF EXISTS validate_backup_schema(text) CASCADE;
DROP FUNCTION IF EXISTS validate_backup_version(int) CASCADE;
```

### What Gets Deployed

The migration creates 5 new PostgreSQL functions:

| Function | Purpose | Security |
|----------|---------|----------|
| `restore_backup()` | Main RPC for atomic restore | SECURITY DEFINER |
| `validate_backup_version()` | Check format version | stable |
| `validate_backup_schema()` | Check schema compatibility | stable |
| `validate_backup_currency()` | Verify currency match | stable |
| `validate_backup_references()` | Validate FK integrity | stable |

### After Deployment

1. **Update TypeScript Types**
   ```bash
   # Generate Supabase types with new RPC
   npm run gen:types
   ```

2. **Run Integration Tests**
   ```bash
   npm run test:integration:restore
   npm run test:integration:rls
   ```

3. **Run E2E Tests**
   ```bash
   npm run test:e2e
   ```

4. **Monitor**
   - Check database logs for any errors
   - Verify performance of restore operations
   - Test with realistic data volumes (1K, 10K payments)

### Performance Considerations

- Single transaction (atomic, all-or-nothing)
- Pre-validation before INSERT (quick fail)
- Foreign key insertion order critical (portfolios → depots → securities → payments)
- No batch operations needed (single INSERT from JSONB)
- Indexes on user_id, foreign keys should be present

### Troubleshooting

**Error: "User must be authenticated"**
- RPC requires valid auth.uid()
- Ensure API call includes Authorization header
- Check JWT token validity

**Error: "missing_security_reference"**
- Backup data has orphaned payment (security_id not in backup)
- Validate backup references before calling RPC

**Error: "currency_mismatch"**
- Backup base_currency doesn't match user's profile
- Update profile currency or use different backup

**Error: "unsupported_format_version"**
- Backup format_version ≠ 1
- Only v1 supported currently

### Next Steps

1. ✅ Deploy migration
2. ✅ Run integration tests
3. ✅ Run E2E tests
4. ✅ Performance test (10K dataset)
5. ✅ Production rollout

---

**Migration ID**: `0022_restore_backup_rpc.sql`  
**Created**: 2026-07-27  
**Status**: Ready for deployment
