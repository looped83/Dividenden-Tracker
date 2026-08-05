# Backup Format Specification v2

## Overview

The Dividend Tracker backup format is a self-contained JSON file that captures a complete snapshot of a user's data at a specific point in time. It is designed for:

- **Data portability**: Export and restore data between instances
- **Disaster recovery**: Restore from backups after data loss
- **Version control**: Track data changes over time
- **Auditability**: Verify backup integrity and completeness

## Format Structure

```json
{
  "format": "dividend-tracker-backup",
  "format_version": 2,
  "schema_version": "0031",
  "app_version": "0.1.0",
  "exported_at": "2026-07-27T12:00:00Z",
  "base_currency": "EUR",
  "metadata": {
    "locale": "de-DE",
    "baseCurrency": "EUR"
  },
  "data": { ... },
  "integrity": { ... }
}
```

### Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | string | Yes | Always `"dividend-tracker-backup"` for identification |
| `format_version` | number | Yes | Backup format version (currently `2`; `1` is still readable) |
| `schema_version` | string | Yes | Database schema version at export time (e.g., `"0031"`) |
| `app_version` | string | No | Application version that created the backup |
| `exported_at` | string | Yes | ISO-8601 timestamp with Z suffix (UTC) |
| `base_currency` | string | Yes | 3-letter ISO 4217 currency code (e.g., `"EUR"`, `"USD"`) |
| `metadata` | object | No | Additional metadata (locale, currency preferences) |
| `data` | object | Yes | Complete user data snapshot |
| `integrity` | object | Yes | Checksums and record counts for validation |

## Data Structure

The `data` section contains the complete user dataset:

```json
{
  "profile": { ... },
  "portfolios": [ ... ],
  "depots": [ ... ],
  "securities": [ ... ],
  "dividend_payments": [ ... ],
  "goals": [ ... ],
  "imports": [ ... ],
  "security_aliases": [ ... ],
  "security_snapshot_runs": [ ... ],
  "security_snapshots": [ ... ],
  "audit_log": [ ... ]
}
```

The last three arrays were added in format version 2. A version 1 file simply
does not contain them; they default to `[]` on read, and the restore writes
nothing for them.

### Profile

User settings and preferences (optional).

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "base_currency": "EUR",
  "locale": "de-DE",
  "theme": "light",
  "backup_reminder_days": 30,
  "last_backup_at": "2026-07-20T10:30:00Z",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-07-27T12:00:00Z"
}
```

### Portfolios

Investment portfolios (optional collection).

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Mein Portfolio",
  "note": "Langfristiges Sparziel",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-07-27T12:00:00Z",
  "archived_at": null
}
```

### Depots

Brokerage accounts/depots (required for restoration).

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Comdirect",
  "broker": "Comdirect Bank",
  "base_currency": "EUR",
  "portfolio_id": "550e8400-e29b-41d4-a716-446655440001",
  "note": "Hauptdepot",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-07-27T12:00:00Z",
  "archived_at": null
}
```

### Securities

Company shares/ETFs (required for restoration).

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Allianz SE",
  "ticker": "ALV",
  "isin": "DE0008404005",
  "wkn": "840400",
  "country": "DE",
  "sector": "Insurance",
  "currency": "EUR",
  "note": "DAX 40 component",
  "data_quality": "ok",
  "default_depot_id": "550e8400-e29b-41d4-a716-446655440002",
  "payout_months": [3, 9],
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-07-27T12:00:00Z",
  "archived_at": null
}
```

### Dividend Payments

Historical dividend payment records.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440004",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "security_id": "550e8400-e29b-41d4-a716-446655440003",
  "depot_id": "550e8400-e29b-41d4-a716-446655440002",
  "import_id": null,
  "pay_date": "2026-03-15",
  "gross_amount": "150.00",
  "net_amount": "127.50",
  "withholding_tax": "22.50",
  "domestic_tax": "0.00",
  "solidarity_surcharge": "0.00",
  "church_tax": "0.00",
  "fees": "0.00",
  "original_currency": "EUR",
  "original_gross": null,
  "original_net": null,
  "fx_rate": null,
  "quantity": "100",
  "amount_per_share": "1.50",
  "payment_type": "regular",
  "source": "manual",
  "source_file_name": null,
  "source_row_number": null,
  "row_fingerprint": null,
  "business_fingerprint": "2026-03-15:alv:100:150.00",
  "note": "Quarterly dividend",
  "created_at": "2026-03-15T00:00:00Z",
  "updated_at": "2026-07-27T12:00:00Z",
  "archived_at": null
}
```

### Goals

Dividend income targets.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440005",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "goal_type": "annual",
  "year": 2026,
  "month": null,
  "target_amount": "10000.00",
  "currency": "EUR",
  "title": "Jahresziel 2026",
  "note": "Passives Einkommen",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-07-27T12:00:00Z",
  "archived_at": null
}
```

### Imports

File import history and metadata.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440006",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "file_name": "dividends_2026.csv",
  "file_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "file_size_bytes": 2048,
  "file_type": "csv",
  "sheet_name": null,
  "status": "committed",
  "column_mapping": {
    "A": "pay_date",
    "B": "security_name",
    "C": "net_amount"
  },
  "detected_formats": { ... },
  "row_balance": { ... },
  "row_report": [ ... ],
  "checksums": { ... },
  "created_at": "2026-07-27T10:00:00Z",
  "committed_at": "2026-07-27T10:05:00Z",
  "rolled_back_at": null
}
```

### Security Aliases

Spellings confirmed during an import ("Coca-Cola Company" means the user's own
"Coca-Cola", IMPORT_SPEC.md §6). Reconstructing them would mean confirming every
mapping by hand again — exactly the work a backup is meant to save.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440007",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "alias_normalized": "coca cola company",
  "security_id": "550e8400-e29b-41d4-a716-446655440002",
  "source_import_id": "550e8400-e29b-41d4-a716-446655440006",
  "created_at": "2026-03-01T09:00:00Z"
}
```

### Security Snapshot Runs

One upload of the DivvyDiary portfolio export (docs/PORTFOLIO_IMPORT.md §6).
Without the run, "no upload that day" cannot be told apart from "no positions
that day".

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440008",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "as_of": "2026-08-03",
  "source": "divvydiary_csv",
  "file_name": "portfolio-1754236800000.csv",
  "rows_total": 42,
  "rows_imported": 40,
  "rows_skipped": 2,
  "rows_invalid": 0,
  "created_at": "2026-08-03T18:00:00Z"
}
```

### Security Snapshots

One portfolio position per security and business date. **Not reconstructible
from the source**: DivvyDiary only ever exports today's state, so a lost
business date is gone for good — unlike the dividend calendar, which a fresh
feed sync rebuilds. Every field except `quantity` and `currency` may be absent
when the source is silent; absent is not zero.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440009",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "security_id": "550e8400-e29b-41d4-a716-446655440002",
  "run_id": "550e8400-e29b-41d4-a716-446655440008",
  "as_of": "2026-08-03",
  "quantity": "12.500000",
  "buyin_per_share": "84.120000",
  "buyin_total": "1051.50",
  "price": "96.400000",
  "market_value": "1205.00",
  "gain_absolute": "153.50",
  "gain_relative": "0.146000",
  "allocation": "0.077971",
  "dividend_yield": "0.031200",
  "dividend_yield_on_buyin": "0.035700",
  "annual_dividend_total": "37.60",
  "dividend_per_share": "3.008000",
  "dividend_frequency": "quarterly",
  "dividend_cagr": "0.052000",
  "dividend_cagr_period": "5y",
  "next_ex_date": "2026-08-14",
  "next_pay_date": "2026-09-15",
  "asset_type": "equity",
  "currency": "EUR",
  "created_at": "2026-08-03T18:00:00Z"
}
```

`run_id` **and** `as_of` together point at the run (composite foreign key,
migration 0029). A snapshot whose business date differs from its run's is
rejected before anything is written.

## Data Types

### Decimal Strings

Money amounts are **always strings** to preserve precision. Format:

- `"123.45"` ✓ Correct
- `"0.01"` ✓ Correct
- `"-123.45"` ✓ Negative allowed for certain calculations
- `"1.234"` ✗ Too many decimals (max 2-8 per field)
- `123.45` ✗ Not a string

**Example:**
```json
{
  "gross_amount": "150.00",
  "net_amount": "127.50",
  "fx_rate": "0.95123456"
}
```

**Rationale:** JavaScript floats lose precision with money calculations (e.g., 0.1 + 0.2 ≠ 0.3). The Decimal.js library parses these strings accurately.

### Business Dates

Business dates (payment dates, goal years) use **YYYY-MM-DD** format (no timezone):

- `"2026-07-27"` ✓ Correct
- `"2026-07-27T12:00:00Z"` ✗ Use for timestamps instead

### Timestamps

Technical timestamps (created_at, updated_at) use **ISO-8601 with Z suffix**:

- `"2026-07-27T12:00:00Z"` ✓ Correct
- `"2026-07-27T12:00:00.123Z"` ✓ With milliseconds
- `"2026-07-27T12:00:00+02:00"` ✗ Use Z for UTC only

### UUIDs

All IDs use UUID v4 format:

- `"550e8400-e29b-41d4-a716-446655440000"` ✓ Correct
- `"550e8400e29b41d4a716446655440000"` ✗ Missing hyphens

## Integrity Section

The `integrity` section contains checksums and record counts for validation:

```json
{
  "record_counts": {
    "portfolio": 1,
    "depot": 2,
    "security": 15,
    "dividend_payment": 145,
    "goal": 3,
    "import": 5,
    "security_alias": 12,
    "security_snapshot_run": 8,
    "security_snapshot": 320
  },
  "totals": {
    "net_sum": "15234.56",
    "gross_sum": "19500.00"
  },
  "checksums": {
    "portfolios": "a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "depots": "b3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "securities": "c3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "dividend_payments": "d3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "goals": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "imports": "f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "security_aliases": "0ab0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "security_snapshot_runs": "1ab0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "security_snapshots": "2ab0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
}
```

### Validation

Before restoration:

1. **Version Check**: `format_version` must be `1` or `2`
2. **Schema Compatibility**: `schema_version` must be supported
3. **Completeness**: Must contain profile, at least one depot and one security
4. **Record Counts**: Actual entity counts must match `record_counts`
5. **Checksums**: SHA-256 hash of each entity type (optional but recommended)

## Restore Modes

### Merge Mode

Combines backup data with existing data:

- **New entities**: Added as-is
- **Existing IDs**: Checked for conflicts
- **Conflicts**: Require user resolution (name, values differ)
- **Duplicates**: Detected by business fingerprint (dates, amounts, fingerprints)
- **Safe**: Non-destructive; existing data never deleted

**Use case:** Restoring data from another device, recovering from partial loss.

### Replace Mode

Removes existing data before restoring:

- **Existing entities**: All marked as `archived_at = now()`
- **Backup entities**: Inserted with original IDs and timestamps
- **Timestamps**: Preserved from backup (audit trail maintained)
- **Destructive**: All active data becomes archived; requires explicit confirmation

**Use case:** Complete device replacement, recovery from catastrophic data loss.

**Snapshots are replaced per business date, not wholesale.** `security_snapshot_runs`,
`security_snapshots` and `security_aliases` carry no UPDATE grant by design: a run is
replaced as a whole, never rewritten row by row. Replace mode therefore deletes exactly
what the file brings — the runs for the business dates it contains (cascading to their
snapshots) and the aliases for the spellings it contains — and then inserts. A business
date the backup does not mention is left alone: deleting it would be irreversible, and
the file makes no claim about it.

In merge mode a business date that already exists wins; the file's run and its snapshots
are skipped together, because a run and its rows belong to each other.

## Validation Rules

### Technical Validation

1. Valid JSON structure
2. Required fields present
3. Field types correct (strings, numbers, booleans, arrays)
4. UUID format for all IDs
5. Decimal string precision (decimal places match field limits)
6. ISO-8601 timestamps valid and parseable
7. Business dates in YYYY-MM-DD format and valid calendar dates
8. ISO-4217 currency codes valid

### Business Validation

1. Foreign key references intact (security_id → securities, depot_id → depots,
   snapshot run_id + as_of → security_snapshot_runs)
2. Record counts match actual entities
3. At least one depot and one security for valid backup
4. No circular references
5. User ID consistency (all records belong to authenticated user)

## Version Compatibility

- **Current**: v2 (this specification)
- **Readable**: v1 and v2. A v1 file restores exactly what it describes; the
  three sections added in v2 stay empty. Rejecting an older backup because the
  format has grown is the moment a backup stops being worth anything.
- **Migration**: No automatic migration; v0 backups require manual data export
- **Forward compatibility**: Newer app versions must keep accepting v1 backups
- **Breaking changes**: Would increment `format_version` to 3

## File Naming Convention

```
dividenden-backup-YYYY-MM-DD.json
```

Example: `dividenden-backup-2026-07-27.json`

**Components:**
- Prefix: `dividenden-backup`
- Date: Current date in ISO-8601 format
- Extension: `.json`

## Security Considerations

1. **No encryption in format**: Encryption is user's responsibility (storage, transmission)
2. **No sensitive credentials**: Passwords, API keys never included
3. **User isolation**: Backups contain only authenticated user's data (enforced server-side)
4. **Data classification**: Treat backups as sensitive as passwords
5. **Audit trail**: Restore operations logged for user review

## Export vs. Restore

### Backup (Complete Restore-able Export)

- Format: JSON (this specification)
- Content: All user data with metadata
- Restore-able: Yes, atomically
- Merge-able: Yes, with conflict detection
- Use: Data recovery, portability

### Data Export (Non-restore-able Analysis)

- Formats: CSV, Excel, JSON (analytical)
- Content: Dividend payments only (filtered)
- Restore-able: No
- Merge-able: N/A
- Use: Analysis, external tools, tax reporting

## Example Minimal Backup

```json
{
  "format": "dividend-tracker-backup",
  "format_version": 2,
  "schema_version": "0031",
  "exported_at": "2026-07-27T12:00:00Z",
  "base_currency": "EUR",
  "data": {
    "profile": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "base_currency": "EUR",
      "locale": "de-DE",
      "theme": "light",
      "backup_reminder_days": 30,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-07-27T12:00:00Z"
    },
    "depots": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Depot 1",
        "base_currency": "EUR",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-07-27T12:00:00Z"
      }
    ],
    "securities": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440002",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Stock A",
        "data_quality": "ok",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-07-27T12:00:00Z"
      }
    ],
    "dividend_payments": [],
    "portfolios": [],
    "goals": [],
    "imports": [],
    "security_aliases": [],
    "security_snapshot_runs": [],
    "security_snapshots": []
  },
  "integrity": {
    "record_counts": {
      "depot": 1,
      "security": 1,
      "dividend_payment": 0,
      "goal": 0,
      "portfolio": 0,
      "import": 0
    }
  }
}
```

## References

- [BACKUP_AND_RESTORE.md](./BACKUP_AND_RESTORE.md) - User guide and workflows
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design and data flow
- [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) - Feature requirements
