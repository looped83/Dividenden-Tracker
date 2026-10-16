# Backup, Restore & Export User Guide

## Overview

The Dividend Tracker provides three data management features:

1. **Backup** — Download a complete snapshot of your data
2. **Restore** — Upload a previous backup to recover data
3. **Export** — Export dividend records in CSV or Excel format

## Backup: Protecting Your Data

### Creating a Backup

1. Go to **Settings** > **Sicherung & Datenexport** (Backup & Export)
2. Click the **"Sicherung jetzt erstellen"** (Create Backup Now) button
3. Wait for the backup to complete (usually 10-30 seconds)
4. Your browser automatically downloads `dividenden-backup-YYYY-MM-DD.json`

### What's Included

A backup contains:

- Your profile settings (language, theme, currency)
- All depots/brokerage accounts
- All securities/stocks you track
- Complete dividend payment history
- All goals and targets
- Import metadata and history

### Backup File Details

- **Format**: JSON (human-readable, can be opened in any text editor)
- **Size**: Usually 100 KB – 5 MB (depending on your data)
- **Encryption**: None built-in (backups are **not encrypted**)
- **Storage**: You control where backups are stored

### Storage Best Practices

1. **Multiple Copies**: Keep backups in 2-3 safe locations
2. **Offline Storage**: Store at least one backup on an external drive
3. **Cloud Storage**: Consider encrypted cloud storage (Google Drive, OneDrive with encryption)
4. **Password Manager**: Store backups in your password manager's secure file storage
5. **Regular Schedule**: Create new backups every 1-2 months (or after major changes)

⚠️ **Security Warning**: Treat backup files like passwords. Anyone with a backup file can see all your dividend records and restore them.

## Restore: Recovering from Backups

### When to Restore

- Recovering from accidental data deletion
- Transferring data between devices
- Restoring after a system failure
- Switching to a different Dividend Tracker instance

### Restore Workflow

1. Go to **Settings** > **Sicherung & Datenexport** > **"Sicherung wiederherstellen"** tab
2. Click **"Datei durchsuchen"** or drag-and-drop a backup file
3. The app validates the backup file
4. Review the **"Sicherungsvorschau"** (Backup Preview) showing:
   - Number of depots
   - Number of securities
   - Number of dividend payments
   - Number of goals
   - When the backup was created
5. Choose a restore mode (see below)
6. Click **"Wiederherstellen"** (Restore)
7. Confirm the action (you'll be asked to verify)
8. Wait for restoration to complete
9. The app reloads with your restored data

### Restore Modes

#### Merge Mode (Recommended for Partial Recovery)

**Use when:** Recovering specific data or merging from another device

**What happens:**
- New data is added to your existing data
- If a duplicate is detected (same ID or same business fingerprint):
  - You'll be asked how to resolve it
  - Options: Skip (keep existing) or Overwrite (use backup version)
- Existing data that's not in the backup remains unchanged
- **Safe**: No data is deleted

**Example:** You backed up on July 1st, added more payments by July 15th, then restore the July 1st backup:
- Result: July 15th payments kept, July 1st payment duplicates resolved by you

#### Replace Mode (Complete Recovery)

**Use when:** Recovering from major data loss or switching systems

**What happens:**
- All your existing data is archived (marked as deleted, but kept in history)
- All data from the backup is restored with original timestamps
- Audit trail is preserved (you can see when data was deleted)
- **Destructive**: Existing data becomes archived

**Example:** Your device was lost on July 15th, you restore a July 1st backup:
- Result: All data from July 1st is restored
- July 2-15 additions are archived
- You can manually re-enter July 2-15 data if needed

### Conflict Resolution

If merge mode detects conflicts:

1. A list of conflicts appears (usually <10)
2. For each conflict, you see:
   - What's currently in your account
   - What's in the backup file
   - Options: **Skip** or **Overwrite**
3. Choose your preference for each item
4. Click **"Wiederherstellen"** to proceed with your choices

### Restore Failed?

**Common reasons and solutions:**

| Problem | Cause | Solution |
|---------|-------|----------|
| "Invalid JSON format" | File is corrupted or not a backup file | Try a different backup file |
| "Schemaversion nicht unterstützt" | Backup from very old app version | Contact support for migration |
| "Fehlende erforderliche Daten" | Backup missing essential data | Use a different, more recent backup |
| "Netzwerkfehler" | Connection issue during restore | Check internet and try again |

## Export: Analyzing Your Data

### When to Export

- Share data with your tax accountant
- Analyze data in Excel or other tools
- Create reports for investment review
- Backup for external storage (non-restorable)

### Export Workflow

1. Go to **Settings** > **Sicherung & Datenexport** > **"Daten exportieren"** tab
2. Choose export format:
   - **CSV** (recommended for Excel/Sheets)
   - **Excel** (.xlsx with formatting)
3. Optional: Check **"Auch archivierte Zahlungen einschließen"** to include old/deleted payments
4. Click **"[Format] exportieren"** button
5. Your browser downloads `dividenden-export-YYYY-MM-DD.[format]`

### Export Formats Explained

#### CSV (Comma-Separated Values)

**Best for:** Excel, Google Sheets, most spreadsheet programs

**Content:**
- One row per dividend payment
- Columns depend on your data: date, company, depot and net amount are always
  present; ticker, gross amount, taxes, fees, quantity, note and the cancelled
  flag appear only when at least one payment carries a value
- UTF-8 with a byte order mark, so umlauts survive Excel on Windows
- No formatting or colors

**Opening:**
1. Open in Excel/Sheets
2. Data automatically parses into columns
3. You can sort, filter, create charts

**Security:** Malicious formulas are automatically escaped (e.g., `=SUM()` becomes `'=SUM()`)

#### Excel (.xlsx)

**Best for:** Professional reports, complex analysis

**Content:**
- Proper Excel spreadsheet with headers
- Number formatting preserved
- Sortable and filterable columns
- Amounts are real numbers and dates are real dates — you can calculate with them
- Print-friendly layout

**Opening:**
1. Open directly in Excel, Numbers, or Google Sheets
2. All formatting ready to use
3. Can add your own formulas and charts

### Export Options

#### Include Archived Payments

By default, only active (non-deleted) payments are exported.

Check **"Auch archivierte Zahlungen einschließen"** to also include:
- Payments you manually deleted
- Payments removed during "Replace" restore
- Storno/cancellation records

**Why include archived?** For complete tax records and historical analysis.

### Working with Exports

#### In Excel

```
1. Open the CSV/XLSX file
2. Select all data (Ctrl+A)
3. Format as table (Insert > Table)
4. Add filters to columns
5. Create pivot table for analysis
6. Export filtered/summarized data to tax software
```

#### In Google Sheets

```
1. Open Google Sheets
2. File > Import > Upload CSV file
3. Choose "Create new spreadsheet"
4. Data automatically parses
5. Share with accountant with view-only access
```

#### For Tax Reporting

Many German tax software packages accept CSV import:

1. Export as CSV
2. Open in tax software (Elster, WISO, etc.)
3. Follow software's import wizard
4. Review and correct any parsing issues

## Common Scenarios

### Scenario 1: Regular Backup Routine

**Goal:** Keep recent backup in case of loss

1. Each month, go to Backup tab
2. Click "Sicherung jetzt erstellen"
3. Move downloaded file to cloud storage folder
4. Keep 3-4 most recent backups, delete older ones

**Frequency:** Monthly (or after adding many payments)

### Scenario 2: Device Replacement

**Goal:** Move all data to new device

1. On old device: Settings > Backup > Create backup
2. Download and save backup file
3. On new device: Open Dividend Tracker, go to Settings > Restore
4. Upload the backup file
5. Choose **Merge mode** (safest, in case you already added data)
6. Click Restore

### Scenario 3: Tax Reporting

**Goal:** Send accurate dividend records to accountant

1. Go to Export tab
2. Choose CSV format
3. Check "Include archived payments" (for complete records)
4. Click "Export"
5. Open in Excel and verify data looks correct
6. Share with accountant or import to tax software

### Scenario 4: Data Analysis

**Goal:** Analyze dividend income trends

1. Export as CSV
2. Open in Excel/Sheets
3. Create pivot table:
   - Rows: Months (from pay_date)
   - Columns: Companies (security_name)
   - Values: Sum of net_amount
4. Create chart showing income by month/company
5. Print for personal records

## Troubleshooting

### Backup Not Downloading

**Symptom:** Clicked "Create Backup" but no file appeared

**Causes & solutions:**
1. **Pop-up blocked**: Check browser pop-up settings
2. **Slow network**: Wait longer, try again
3. **Large account**: Backups with 10,000+ payments may take 1-2 minutes
4. **Browser issue**: Try a different browser or device

### Restore Shows Error

**Symptom:** "Backup format validation failed" or similar error

**Causes & solutions:**
1. **Wrong file**: Ensure it's actually a backup (ends in `.json`)
2. **Corrupted file**: Download from cloud storage again, check file size
3. **Very old backup**: Try a more recent backup file
4. **Version mismatch**: Ensure app is up-to-date

### Export Creates Empty File

**Symptom:** Export file downloaded but contains no data

**Causes & solutions:**
1. **No payments**: Account has no dividend payments to export
2. **Wrong filters**: Check if date range filters are excluding everything
3. **Browser issue**: Try downloading again or use different browser
4. **File size**: Check file size is >0 bytes

## Privacy & Security FAQs

**Q: Are backups encrypted?**
A: No. You must encrypt backups yourself (device encryption, cloud provider, etc.)

**Q: Can someone else restore my data?**
A: Only with your login credentials AND a backup file. Both are needed.

**Q: Do exports include passwords or sensitive data?**
A: No. Only dividend records, company names, amounts, and dates.

**Q: How long does Dividend Tracker keep my backups?**
A: We don't store backups. **You** store them on your devices/cloud.

**Q: Can I edit a backup file?**
A: Yes (it's JSON), but be careful. Invalid edits can cause restore failures.

**Q: What if I lose all backup files?**
A: Data in Dividend Tracker remains safe. Create a new backup immediately. Lost backups cannot be recovered from our servers.

## See Also

- [Backup Format Specification](./BACKUP_FORMAT.md) — Technical details
- [Architecture Documentation](./ARCHITECTURE.md) — How backup works internally
- [Product Specification](./PRODUCT_SPEC.md) — Feature requirements
