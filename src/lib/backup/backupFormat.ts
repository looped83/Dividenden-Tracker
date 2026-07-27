/**
 * Backup Format Definition & Validation
 *
 * Defines the complete backup format v1 with Zod schemas for:
 * - Format structure (root, metadata, data sections)
 * - Entity-specific structures (profiles, securities, etc.)
 * - Integrity checksums
 * - Version compatibility
 */

import { z } from "zod";
import Decimal from "decimal.js";

// ============================================================================
// Constants
// ============================================================================

export const BACKUP_FORMAT = "dividend-tracker-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const MIN_SCHEMA_VERSION = "0022"; // First schema version supporting backups

// ============================================================================
// Base Type Schemas
// ============================================================================

/**
 * Decimal string: canonical format with point separator
 * Never scientific notation, max 2-8 decimal places depending on field type
 */
const decimalString = (maxDecimals: number, label?: string) =>
  z
    .string()
    .regex(
      /^-?\d+(\.\d+)?$/,
      label
        ? `${label} must be a decimal string (e.g. "123.45")`
        : "Invalid decimal format",
    )
    .refine(
      (val) => {
        try {
          const d = new Decimal(val);
          const places = d.decimalPlaces();
          return places >= 0 && places <= maxDecimals;
        } catch {
          return false;
        }
      },
      `${label ?? "Amount"} must have at most ${String(maxDecimals)} decimal places`,
    );

/**
 * Business date: YYYY-MM-DD format, no timezone
 */
const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((val) => {
    const d = new Date(val + "T00:00:00Z");
    return d.toISOString().startsWith(val);
  }, "Invalid date");

/**
 * ISO 8601 timestamp with Z suffix
 */
const isoTimestamp = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
    "Timestamp must be ISO 8601 with Z",
  );

/**
 * ISO 4217 currency code (3 uppercase letters)
 */
const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "Currency must be 3-letter ISO 4217 code");

/**
 * UUID v4
 */
const uuidString = z.uuid();

// ============================================================================
// Entity Schemas
// ============================================================================

export const portfolioBackupSchema = z.object({
  id: uuidString,
  user_id: uuidString,
  name: z.string().max(100),
  note: z.string().max(2000).optional(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  archived_at: isoTimestamp.optional(),
});
export type PortfolioBackup = z.infer<typeof portfolioBackupSchema>;

export const depotBackupSchema = z.object({
  id: uuidString,
  user_id: uuidString,
  name: z.string().max(100),
  broker: z.string().max(100).optional(),
  base_currency: currencyCode,
  portfolio_id: uuidString.optional(),
  note: z.string().max(2000).optional(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  archived_at: isoTimestamp.optional(),
  archive_reason: z.string().optional(),
});
export type DepotBackup = z.infer<typeof depotBackupSchema>;

export const securityBackupSchema = z.object({
  id: uuidString,
  user_id: uuidString,
  name: z.string().max(200),
  ticker: z.string().max(20).optional(),
  isin: z.string().length(12).optional(),
  wkn: z.string().length(6).optional(),
  country: z.string().length(2).optional(),
  sector: z.string().max(100).optional(),
  currency: currencyCode.optional(),
  note: z.string().max(5000).optional(),
  data_quality: z.enum(["ok", "incomplete", "needs_review"]),
  default_depot_id: uuidString.optional(),
  payout_months: z.array(z.number().int().min(1).max(12)).optional(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  archived_at: isoTimestamp.optional(),
});
export type SecurityBackup = z.infer<typeof securityBackupSchema>;

export const goalBackupSchema = z.object({
  id: uuidString,
  user_id: uuidString,
  goal_type: z.enum(["annual", "monthly"]),
  year: z.number().int().min(1990).max(2100),
  month: z.number().int().min(1).max(12).optional(),
  target_amount: decimalString(2, "Target amount"),
  currency: currencyCode,
  title: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  archived_at: isoTimestamp.optional(),
});
export type GoalBackup = z.infer<typeof goalBackupSchema>;

export const importBackupSchema = z.object({
  id: uuidString,
  user_id: uuidString,
  file_name: z.string(),
  file_hash: z.string().length(64), // SHA-256 hex
  file_size_bytes: z.number().int().min(0),
  file_type: z.enum(["csv", "xlsx", "xls"]),
  sheet_name: z.string().optional(),
  status: z.enum([
    "analyzing",
    "pending_confirmation",
    "committed",
    "rolled_back",
    "discarded",
  ]),
  column_mapping: z.record(z.string(), z.string()).optional(),
  detected_formats: z.record(z.string(), z.any()).optional(),
  row_balance: z.record(z.string(), z.any()).optional(),
  row_report: z.array(z.any()).optional(),
  checksums: z.record(z.string(), z.any()).optional(),
  created_at: isoTimestamp,
  committed_at: isoTimestamp.optional(),
  rolled_back_at: isoTimestamp.optional(),
});
export type ImportBackup = z.infer<typeof importBackupSchema>;

export const dividendPaymentBackupSchema = z.object({
  id: uuidString,
  user_id: uuidString,
  security_id: uuidString,
  depot_id: uuidString,
  import_id: uuidString.optional(),
  pay_date: businessDate,
  gross_amount: decimalString(2, "Gross amount"),
  net_amount: decimalString(2, "Net amount"),
  withholding_tax: decimalString(2).default("0"),
  domestic_tax: decimalString(2).default("0"),
  solidarity_surcharge: decimalString(2).default("0"),
  church_tax: decimalString(2).default("0"),
  fees: decimalString(2).default("0"),
  original_currency: currencyCode,
  original_gross: decimalString(6).optional(),
  original_net: decimalString(6).optional(),
  fx_rate: decimalString(8).optional(),
  quantity: decimalString(6).optional(),
  amount_per_share: decimalString(8).optional(),
  payment_type: z.enum([
    "regular",
    "special",
    "correction",
    "cancellation",
    "refund",
    "other",
  ]),
  source: z.enum(["manual", "csv_import", "excel_import", "restore"]),
  source_file_name: z.string().optional(),
  source_row_number: z.number().int().optional(),
  row_fingerprint: z.string().optional(),
  business_fingerprint: z.string().optional(),
  note: z.string().max(5000).optional(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  archived_at: isoTimestamp.optional(),
  archive_reason: z.string().optional(),
});
export type DividendPaymentBackup = z.infer<typeof dividendPaymentBackupSchema>;

export const profileBackupSchema = z.object({
  id: uuidString,
  base_currency: currencyCode,
  locale: z.string(),
  theme: z.enum(["light", "dark", "system"]),
  backup_reminder_days: z.number().int().min(1).max(365),
  last_backup_at: isoTimestamp.optional(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
});
export type ProfileBackup = z.infer<typeof profileBackupSchema>;

// ============================================================================
// Integrity Information Schema
// ============================================================================

export const integritySchema = z.object({
  record_counts: z.record(z.string(), z.number().int().min(0)),
  totals: z
    .object({
      net_sum: decimalString(2, "Net sum"),
      gross_sum: decimalString(2, "Gross sum"),
    })
    .optional(),
  checksums: z.record(z.string(), z.string()).optional(),
});
export type IntegrityInfo = z.infer<typeof integritySchema>;

// ============================================================================
// Complete Backup Schema
// ============================================================================

export const backupDataSchema = z.object({
  profile: profileBackupSchema.optional(),
  portfolios: z.array(portfolioBackupSchema).default([]),
  depots: z.array(depotBackupSchema).default([]),
  securities: z.array(securityBackupSchema).default([]),
  dividend_payments: z.array(dividendPaymentBackupSchema).default([]),
  goals: z.array(goalBackupSchema).default([]),
  imports: z.array(importBackupSchema).default([]),
  audit_log: z.array(z.record(z.string(), z.any())).optional(),
});
export type BackupData = z.infer<typeof backupDataSchema>;

export const backupRootSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  format_version: z.literal(BACKUP_FORMAT_VERSION),
  schema_version: z.string(),
  app_version: z.string().optional(),
  exported_at: isoTimestamp,
  base_currency: currencyCode,
  metadata: z
    .object({
      locale: z.string().optional(),
      baseCurrency: currencyCode.optional(),
    })
    .optional(),
  data: backupDataSchema,
  integrity: integritySchema,
});

export type BackupRoot = z.infer<typeof backupRootSchema>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Parse and validate a backup from JSON
 * Throws ZodError with detailed field-level errors if invalid
 */
export function parseBackup(input: unknown): BackupRoot {
  return backupRootSchema.parse(input);
}

/**
 * Safely parse backup with error details
 */
export function parseBackupSafe(
  input: unknown,
):
  | { success: true; data: BackupRoot }
  | { success: false; errors: { path: string; message: string }[] } {
  const result = backupRootSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join(".") || "root",
      message: issue.message,
    })),
  };
}

/**
 * Validate backup format version
 */
export function validateBackupVersion(formatVersion: number): {
  valid: boolean;
  message?: string;
} {
  if (formatVersion === BACKUP_FORMAT_VERSION) {
    return { valid: true };
  }

  if (formatVersion > BACKUP_FORMAT_VERSION) {
    return {
      valid: false,
      message: `Backup was created with a newer format version (v${String(formatVersion)}). Please update the application.`,
    };
  }

  // Older version: could be migrated, but for now reject
  return {
    valid: false,
    message: `Backup format version v${String(formatVersion)} is not supported.`,
  };
}

/**
 * Validate that required entities exist in backup
 */
export function validateBackupCompleteness(backup: BackupRoot): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!backup.data.profile) missing.push("profile");
  if (backup.data.depots.length === 0) missing.push("depots");
  if (backup.data.securities.length === 0) missing.push("securities");

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Check backup record counts against actual data
 */
export function validateBackupIntegrity(backup: BackupRoot): {
  valid: boolean;
  mismatches: { entity: string; expected: number; actual: number }[];
} {
  const mismatches: { entity: string; expected: number; actual: number }[] = [];

  const expectedCounts = backup.integrity.record_counts;
  const actualCounts = {
    portfolio: backup.data.portfolios.length,
    depot: backup.data.depots.length,
    security: backup.data.securities.length,
    dividend_payment: backup.data.dividend_payments.length,
    goal: backup.data.goals.length,
    import: backup.data.imports.length,
  };

  for (const [entity, expected] of Object.entries(expectedCounts)) {
    const actual = actualCounts[entity as keyof typeof actualCounts];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (actual !== undefined && actual !== expected) {
      mismatches.push({ entity, expected, actual });
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}
