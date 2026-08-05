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
/**
 * Version 2 ergaenzt die Depotstaende (`security_snapshots`,
 * `security_snapshot_runs`) und die beim Import bestaetigten Schreibweisen
 * (`security_aliases`) — siehe docs/PORTFOLIO_IMPORT.md.
 */
export const BACKUP_FORMAT_VERSION = 2;

/**
 * Versionen, die sich **einlesen** lassen. Version 1 bleibt ausdruecklich
 * dabei: Sie enthaelt die neuen Bereiche schlicht nicht, und die Arrays
 * bleiben leer. Eine aeltere Sicherung abzuweisen, weil das Format gewachsen
 * ist, waere genau der Moment, in dem eine Datensicherung nichts mehr wert
 * ist.
 */
export const READABLE_FORMAT_VERSIONS = [1, 2] as const;
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
 * Zeitstempel in der Sicherungsdatei.
 *
 * Geschrieben wird die kanonische Form mit `Z` ({@link toIsoTimestamp}).
 * **Gelesen** wird jede gültige ISO-8601-Schreibweise: PostgREST liefert
 * Zeitstempel als `2025-06-15T10:30:00.123456+00:00` — also mit Zeitzonen-
 * versatz statt `Z` und mit Mikrosekunden statt Millisekunden.
 *
 * Die frühere Fassung verlangte beim Lesen starr `Z` und höchstens drei
 * Nachkommastellen. Damit konnte die App **ihre eigene Sicherungsdatei nicht
 * einlesen**: Jede Wiederherstellung scheiterte an der Formatprüfung, bevor
 * sie begann. Ein Prüfausdruck, der die eigenen Dateien ablehnt, schützt vor
 * nichts — er verhindert nur die Rettung.
 *
 * Beim Lesen wird zusätzlich normalisiert, sodass alte und neue Dateien
 * intern dieselbe Form haben.
 */
const ISO_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * Bringt einen Zeitstempel auf die kanonische Form `YYYY-MM-DDTHH:MM:SS.sssZ`.
 * Liefert `null`, wenn der Wert kein gültiger Zeitstempel ist.
 */
export function toIsoTimestamp(value: string): string | null {
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return null;

  const [, date, time, zone] = match;

  // Ohne Zeitzonenangabe gilt UTC: Alle Zeitstempelspalten dieses Projekts
  // sind `timestamptz`, und Postgres gibt sie in UTC aus.
  //
  // `+00` (psql-Textausgabe) auf `+00:00` erweitern und `+0000` mit
  // Doppelpunkt versehen — beides akzeptiert `new Date()` sonst nicht,
  // obwohl es gültiges ISO 8601 ist.
  let offset = "Z";
  if (zone && zone !== "Z") {
    const sign = zone.slice(0, 1);
    const digits = zone.slice(1).replace(":", "");
    const hours = digits.slice(0, 2);
    const minutes = digits.length > 2 ? digits.slice(2, 4) : "00";
    offset = `${sign}${hours}:${minutes}`;
  }

  const parsed = new Date(`${date}T${time}${offset}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

const isoTimestamp = z.string().transform((value, ctx) => {
  const normalized = toIsoTimestamp(value);
  if (normalized === null) {
    ctx.addIssue({ code: "custom", message: `Kein gültiger Zeitstempel: "${value}"` });
    return z.NEVER;
  }
  return normalized;
});

/**
 * Beliebiger JSON-Wert, auch fehlend.
 *
 * Für Felder, die als `jsonb` gespeichert und beim Wiederherstellen
 * unverändert zurückgeschrieben werden. Sie sind für die Sicherung
 * durchzureichende Fracht — die Struktur zu prüfen brächte keine Sicherheit
 * und hat bereits zweimal dazu geführt, dass gültige Dateien abgelehnt wurden.
 *
 * **`.optional()` ist hier zwingend.** In Zod 4 ist `z.unknown()` innerhalb
 * eines Objekts ein *Pflichtfeld*: Ein fehlender Schlüssel scheitert mit
 * „expected nonoptional, received undefined" (in Zod 3 war er optional). Da
 * `removeNulls` leere Felder gar nicht erst in die Datei schreibt, fehlen
 * genau die Schlüssel, die in der Datenbank `null` sind — und die Datei wäre
 * ohne `.optional()` nicht einlesbar.
 */
const jsonValue = z.unknown().optional();

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
  // Importmetadaten: in der Datenbank `jsonb`, beim Wiederherstellen
  // unverändert zurückgeschrieben. Ihre innere Struktur wird bewusst **nicht**
  // geprüft.
  //
  // Die frühere Fassung tat es und lag daneben: `column_mapping` wurde als
  // `Record<string, string>` beschrieben, enthält aber Spaltenindizes, also
  // Zahlen (`{ pay_date: 0, security: 1 }`). Jede Sicherung mit
  // Importhistorie wurde dadurch beim Einlesen abgelehnt.
  //
  // Diese Blöcke sind Herkunftsnachweise, keine fachlichen Daten. Ihre Form
  // folgt der Importpipeline und ändert sich mit ihr; sie hier ein zweites
  // Mal zu beschreiben schafft keine Sicherheit, sondern nur eine Kopie, die
  // auseinanderläuft. Was zählt, ist dass sie den Weg unverändert überstehen.
  column_mapping: jsonValue,
  detected_formats: jsonValue,
  row_balance: jsonValue,
  row_report: jsonValue,
  checksums: jsonValue,
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

// ============================================================================
// Depotstaende und bestaetigte Schreibweisen (Formatversion 2)
// ============================================================================

/**
 * Ein Upload des Portfolio-Exports (docs/PORTFOLIO_IMPORT.md §6).
 *
 * Ohne ihn liesse sich „an diesem Tag kein Upload" nicht von „an diesem Tag
 * keine Positionen" unterscheiden — auch nicht nach einer Wiederherstellung.
 */
export const snapshotRunBackupSchema = z.object({
  id: uuidString,
  user_id: uuidString.optional(),
  as_of: businessDate,
  source: z.string().min(1).max(50),
  file_name: z.string().max(260).optional(),
  rows_total: z.number().int().min(0),
  rows_imported: z.number().int().min(0),
  rows_skipped: z.number().int().min(0),
  rows_invalid: z.number().int().min(0),
  created_at: isoTimestamp,
});
export type SnapshotRunBackup = z.infer<typeof snapshotRunBackupSchema>;

/**
 * Ein Depotstand je Unternehmen und Stichtag.
 *
 * **Nicht wiederherstellbar aus der Quelle**: DivvyDiary exportiert immer nur
 * den heutigen Stand. Geht diese Zeile verloren, ist der Tag, den sie
 * beschreibt, endgueltig weg — anders als die Kalendertermine, die ein
 * erneuter Feed-Abgleich wieder aufbaut.
 */
export const securitySnapshotBackupSchema = z.object({
  id: uuidString,
  user_id: uuidString.optional(),
  security_id: uuidString,
  run_id: uuidString,
  as_of: businessDate,
  quantity: decimalString(6, "Quantity"),
  buyin_per_share: decimalString(6, "Buy-in per share").optional(),
  buyin_total: decimalString(2, "Buy-in total").optional(),
  price: decimalString(6, "Price").optional(),
  market_value: decimalString(2, "Market value").optional(),
  gain_absolute: decimalString(2, "Gain").optional(),
  gain_relative: decimalString(6, "Gain ratio").optional(),
  allocation: decimalString(6, "Allocation").optional(),
  dividend_yield: decimalString(6, "Dividend yield").optional(),
  dividend_yield_on_buyin: decimalString(6, "Yield on buy-in").optional(),
  annual_dividend_total: decimalString(2, "Annual dividend").optional(),
  dividend_per_share: decimalString(6, "Dividend per share").optional(),
  dividend_frequency: z.string().max(20).optional(),
  dividend_cagr: decimalString(6, "Dividend CAGR").optional(),
  dividend_cagr_period: z.string().max(10).optional(),
  next_ex_date: businessDate.optional(),
  next_pay_date: businessDate.optional(),
  asset_type: z.string().max(20).optional(),
  currency: currencyCode,
  created_at: isoTimestamp,
});
export type SecuritySnapshotBackup = z.infer<typeof securitySnapshotBackupSchema>;

/**
 * Eine beim Import bestaetigte Schreibweise („Coca-Cola Company" meint das
 * eigene „Coca-Cola", IMPORT_SPEC.md §6).
 *
 * Wiederherstellbar waere sie nur, indem der Nutzer jede Zuordnung erneut
 * bestaetigt — Arbeit, die eine Sicherung ihm abnehmen soll.
 */
export const securityAliasBackupSchema = z.object({
  id: uuidString,
  user_id: uuidString.optional(),
  alias_normalized: z.string().min(1).max(200),
  security_id: uuidString,
  source_import_id: uuidString.optional(),
  created_at: isoTimestamp,
});
export type SecurityAliasBackup = z.infer<typeof securityAliasBackupSchema>;

export const backupDataSchema = z.object({
  profile: profileBackupSchema.optional(),
  portfolios: z.array(portfolioBackupSchema).default([]),
  depots: z.array(depotBackupSchema).default([]),
  securities: z.array(securityBackupSchema).default([]),
  dividend_payments: z.array(dividendPaymentBackupSchema).default([]),
  goals: z.array(goalBackupSchema).default([]),
  imports: z.array(importBackupSchema).default([]),
  // Ab Formatversion 2. `default([])` haelt Dateien der Version 1 lesbar.
  security_aliases: z.array(securityAliasBackupSchema).default([]),
  security_snapshot_runs: z.array(snapshotRunBackupSchema).default([]),
  security_snapshots: z.array(securitySnapshotBackupSchema).default([]),
  audit_log: z.array(z.record(z.string(), z.any())).optional(),
});
export type BackupData = z.infer<typeof backupDataSchema>;

export const backupRootSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  // Nicht `literal(BACKUP_FORMAT_VERSION)`: Sonst scheiterte eine Datei der
  // Version 1 schon am Schema, lange bevor `validateBackupVersion` sie
  // beurteilen koennte.
  format_version: z.union([z.literal(1), z.literal(2)]),
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

  // Aeltere, aber lesbare Version: Die seither hinzugekommenen Bereiche fehlen
  // in der Datei und bleiben nach dem Einspielen leer. Das ist kein Fehler,
  // sondern der Stand, den diese Datei beschreibt.
  if ((READABLE_FORMAT_VERSIONS as readonly number[]).includes(formatVersion)) {
    return { valid: true };
  }

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
    security_alias: backup.data.security_aliases.length,
    security_snapshot_run: backup.data.security_snapshot_runs.length,
    security_snapshot: backup.data.security_snapshots.length,
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
