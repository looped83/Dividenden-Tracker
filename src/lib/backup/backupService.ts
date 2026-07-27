/**
 * Backup Service
 *
 * Client-side service for creating complete backups:
 * - Fetches all user data from Supabase
 * - Serializes to backup format v1
 * - Computes integrity checksums
 * - Generates downloadable JSON file
 * - Updates last_backup_at on profile
 */

import Decimal from "decimal.js";
import { supabase } from "@/lib/supabase/client";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  type BackupRoot,
  type BackupData,
  type DividendPaymentBackup,
  type SecurityBackup,
  type DepotBackup,
  type PortfolioBackup,
  type GoalBackup,
  type ImportBackup,
  type ProfileBackup,
  type IntegrityInfo,
} from "./backupFormat";

// ============================================================================
// Types
// ============================================================================

export interface BackupProgress {
  stage:
    | "fetching_profiles"
    | "fetching_data"
    | "serializing"
    | "generating"
    | "reading_file"
    | "validating"
    | "detecting_conflicts"
    | "restoring"
    | "invalidating_cache"
    | "filtering"
    | "formatting";
  itemsProcessed?: number;
  totalItems?: number;
}

export interface BackupResult {
  success: boolean;
  backup?: BackupRoot;
  fileName?: string;
  error?: string;
  errorDetails?: string;
}

export interface BackupSummary {
  portfolios: number;
  depots: number;
  securities: number;
  dividendPayments: number;
  goals: number;
  imports: number;
  totalSize: string; // Human readable
  exportedAt: string;
}

// ============================================================================
// Helpers: Type conversions and formatting
// ============================================================================

/**
 * Remove null values from object (convert to undefined for optional fields)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function removeNulls<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null) {
      (result as Record<string, any>)[key] = value;
    }
  }
  return result;
}

/**
 * Format current timestamp as ISO 8601 with Z
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format date as YYYY-MM-DD (business date, no timezone)
 */
function formatBusinessDate(date: Date | string): string {
  if (typeof date === "string") {
    return date; // Already formatted
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Convert numeric(14,2) from Supabase (might be string or number) to decimal string
 */
function ensureDecimalString(value: unknown, maxDecimals = 2): string | null {
  if (value === null || value === undefined) return null;

  try {
    const d = new Decimal(String(value));
    return d.toFixed(maxDecimals);
  } catch {
    console.error("Failed to convert to decimal:", value);
    return null;
  }
}

/**
 * Convert string array from Supabase to array of numbers (for payout_months)
 */
function ensureNumberArray(value: unknown): number[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        const n = typeof v === "number" ? v : parseInt(String(v), 10);
        return isNaN(n) ? null : n;
      })
      .filter((n) => n !== null);
  }
  return null;
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetch user's profile
 */
async function fetchProfile(): Promise<ProfileBackup | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }

  if (!data) return null;

  return removeNulls({
    id: data.id,
    base_currency: data.base_currency,
    locale: data.locale,
    theme: data.theme,
    backup_reminder_days: data.backup_reminder_days,
    last_backup_at: data.last_backup_at,
    created_at: data.created_at,
    updated_at: data.updated_at,
  }) as ProfileBackup;
}

/**
 * Fetch all portfolios
 */
async function fetchPortfolios(): Promise<PortfolioBackup[]> {
  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching portfolios:", error);
    return [];
  }

  return (data || []).map(
    (p) =>
      removeNulls({
        id: p.id,
        user_id: p.user_id,
        name: p.name,
        note: p.note,
        created_at: p.created_at,
        updated_at: p.updated_at,
        archived_at: p.archived_at,
      }) as PortfolioBackup,
  );
}

/**
 * Fetch all depots
 */
async function fetchDepots(): Promise<DepotBackup[]> {
  const { data, error } = await supabase
    .from("depots")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching depots:", error);
    return [];
  }

  return (data || []).map(
    (d) =>
      removeNulls({
        id: d.id,
        user_id: d.user_id,
        name: d.name,
        broker: d.broker,
        base_currency: d.base_currency,
        portfolio_id: d.portfolio_id,
        note: d.note,
        created_at: d.created_at,
        updated_at: d.updated_at,
        archived_at: d.archived_at,
      }) as DepotBackup,
  );
}

/**
 * Fetch all securities
 */
async function fetchSecurities(): Promise<SecurityBackup[]> {
  const { data, error } = await supabase
    .from("securities")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching securities:", error);
    return [];
  }

  return (data || []).map(
    (s) =>
      removeNulls({
        id: s.id,
        user_id: s.user_id,
        name: s.name,
        ticker: s.ticker,
        isin: s.isin,
        wkn: s.wkn,
        country: s.country,
        sector: s.sector,
        currency: s.currency,
        note: s.note,
        data_quality: s.data_quality,
        default_depot_id: s.default_depot_id,
        payout_months: ensureNumberArray(s.payout_months),
        created_at: s.created_at,
        updated_at: s.updated_at,
        archived_at: s.archived_at,
      }) as SecurityBackup,
  );
}

/**
 * Fetch all dividend payments (including archived)
 */
async function fetchDividendPayments(): Promise<DividendPaymentBackup[]> {
  const { data, error } = await supabase
    .from("dividend_payments")
    .select("*")
    .order("pay_date", { ascending: true });

  if (error) {
    console.error("Error fetching dividend payments:", error);
    return [];
  }

  return (data || []).map(
    (p) =>
      removeNulls({
        id: p.id,
        user_id: p.user_id,
        security_id: p.security_id,
        depot_id: p.depot_id,
        import_id: p.import_id,
        pay_date: formatBusinessDate(p.pay_date),
        gross_amount: ensureDecimalString(p.gross_amount, 2) || "0.00",
        net_amount: ensureDecimalString(p.net_amount, 2) || "0.00",
        withholding_tax: ensureDecimalString(p.withholding_tax, 2) || "0.00",
        domestic_tax: ensureDecimalString(p.domestic_tax, 2) || "0.00",
        solidarity_surcharge: ensureDecimalString(p.solidarity_surcharge, 2) || "0.00",
        church_tax: ensureDecimalString(p.church_tax, 2) || "0.00",
        fees: ensureDecimalString(p.fees, 2) || "0.00",
        original_currency: p.original_currency,
        original_gross: ensureDecimalString(p.original_gross, 6),
        original_net: ensureDecimalString(p.original_net, 6),
        fx_rate: ensureDecimalString(p.fx_rate, 8),
        quantity: ensureDecimalString(p.quantity, 6),
        amount_per_share: ensureDecimalString(p.amount_per_share, 8),
        payment_type: p.payment_type,
        source: p.source,
        source_file_name: p.source_file_name,
        source_row_number: p.source_row_number,
        row_fingerprint: p.row_fingerprint,
        business_fingerprint: p.business_fingerprint,
        note: p.note,
        created_at: p.created_at,
        updated_at: p.updated_at,
        archived_at: p.archived_at,
        archive_reason: p.archive_reason,
      }) as DividendPaymentBackup,
  );
}

/**
 * Fetch all goals
 */
async function fetchGoals(): Promise<GoalBackup[]> {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .order("year", { ascending: true });

  if (error) {
    console.error("Error fetching goals:", error);
    return [];
  }

  return (data || []).map(
    (g) =>
      removeNulls({
        id: g.id,
        user_id: g.user_id,
        goal_type: g.goal_type,
        year: g.year,
        month: g.month,
        target_amount: ensureDecimalString(g.target_amount, 2) || "0.00",
        currency: g.currency,
        title: g.title,
        note: g.note,
        created_at: g.created_at,
        updated_at: g.updated_at,
      }) as GoalBackup,
  );
}

/**
 * Fetch all imports (metadata only)
 */
async function fetchImports(): Promise<ImportBackup[]> {
  const { data, error } = await supabase
    .from("imports")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching imports:", error);
    return [];
  }

  return (data || []).map(
    (i) =>
      removeNulls({
        id: i.id,
        user_id: i.user_id,
        file_name: i.file_name,
        file_hash: i.file_hash,
        file_size_bytes: i.file_size_bytes,
        file_type: i.file_type,
        sheet_name: i.sheet_name,
        status: i.status,
        column_mapping:
          typeof i.column_mapping === "string"
            ? JSON.parse(i.column_mapping)
            : i.column_mapping,
        detected_formats:
          typeof i.detected_formats === "string"
            ? JSON.parse(i.detected_formats)
            : i.detected_formats,
        row_balance:
          typeof i.row_balance === "string" ? JSON.parse(i.row_balance) : i.row_balance,
        row_report:
          typeof i.row_report === "string" ? JSON.parse(i.row_report) : i.row_report,
        checksums:
          typeof i.checksums === "string" ? JSON.parse(i.checksums) : i.checksums,
        created_at: i.created_at,
        committed_at: i.committed_at,
        rolled_back_at: i.rolled_back_at,
      }) as ImportBackup,
  );
}

// ============================================================================
// Checksum Computation
// ============================================================================

/**
 * Compute SHA-256 checksum for a data array
 * Serializes with deterministic ordering (by ID)
 */
async function computeChecksum(data: unknown[]): Promise<string> {
  const sorted = (data as any[]).sort((a, b) => {
    const aId = a.id || "";
    const bId = b.id || "";
    return aId.localeCompare(bId);
  });

  const canonical = JSON.stringify(sorted, (_key, value) => {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce((obj: any, k) => {
          obj[k] = value[k];
          return obj;
        }, {});
    }
    return value;
  });

  const encoder = new TextEncoder();
  const data_bytes = encoder.encode(canonical);
  const hash_buffer = await crypto.subtle.digest("SHA-256", data_bytes);
  const hash_array = Array.from(new Uint8Array(hash_buffer));
  return hash_array.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute integrity information (record counts, totals, checksums)
 */
async function computeIntegrity(data: BackupData): Promise<IntegrityInfo> {
  const record_counts = {
    portfolio: data.portfolios.length,
    depot: data.depots.length,
    security: data.securities.length,
    dividend_payment: data.dividend_payments.length,
    goal: data.goals.length,
    import: data.imports.length,
  };

  // Compute total sums for active payments
  let netSum = new Decimal("0");
  let grossSum = new Decimal("0");

  for (const p of data.dividend_payments) {
    // Only include non-archived payments in totals
    if (!p.archived_at) {
      netSum = netSum.plus(p.net_amount);
      grossSum = grossSum.plus(p.gross_amount);
    }
  }

  // Compute checksums
  const checksums: Record<string, string> = {};

  if (data.portfolios.length > 0) {
    checksums["portfolios"] = await computeChecksum(data.portfolios);
  }
  if (data.depots.length > 0) {
    checksums["depots"] = await computeChecksum(data.depots);
  }
  if (data.securities.length > 0) {
    checksums["securities"] = await computeChecksum(data.securities);
  }
  if (data.dividend_payments.length > 0) {
    checksums["dividend_payments"] = await computeChecksum(data.dividend_payments);
  }
  if (data.goals.length > 0) {
    checksums["goals"] = await computeChecksum(data.goals);
  }
  if (data.imports.length > 0) {
    checksums["imports"] = await computeChecksum(data.imports);
  }

  return {
    record_counts,
    totals: {
      net_sum: netSum.toFixed(2),
      gross_sum: grossSum.toFixed(2),
    },
    checksums: Object.keys(checksums).length > 0 ? checksums : undefined,
  };
}

// ============================================================================
// Main Backup Creation
// ============================================================================

/**
 * Create a complete backup of all user data
 * @param onProgress Callback for progress updates
 */
export async function createBackup(
  onProgress?: (progress: BackupProgress) => void,
): Promise<BackupResult> {
  try {
    // Fetch profile first
    onProgress?.({ stage: "fetching_profiles" });
    const profile = await fetchProfile();

    if (!profile) {
      return {
        success: false,
        error: "User profile not found",
        errorDetails: "Unable to load user profile. Please ensure you are authenticated.",
      };
    }

    // Fetch all data
    onProgress?.({ stage: "fetching_data" });
    const [portfolios, depots, securities, dividendPayments, goals, imports] =
      await Promise.all([
        fetchPortfolios(),
        fetchDepots(),
        fetchSecurities(),
        fetchDividendPayments(),
        fetchGoals(),
        fetchImports(),
      ]);

    // Serialize to backup data structure
    onProgress?.({ stage: "serializing" });
    const data: BackupData = {
      profile,
      portfolios,
      depots,
      securities,
      dividend_payments: dividendPayments,
      goals,
      imports,
    };

    // Compute integrity info
    const integrity = await computeIntegrity(data);

    // Build root backup object
    onProgress?.({ stage: "generating" });
    const backup: BackupRoot = {
      format: BACKUP_FORMAT,
      format_version: BACKUP_FORMAT_VERSION,
      schema_version: "0022", // Update when schema changes
      app_version: "1.0.0", // TODO: derive from package.json
      exported_at: getCurrentTimestamp(),
      base_currency: profile.base_currency,
      data,
      integrity,
    };

    // Generate filename
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const fileName = `dividend-tracker-backup-${dateStr}.json`;

    return {
      success: true,
      backup,
      fileName,
    };
  } catch (error) {
    console.error("Backup creation failed:", error);
    return {
      success: false,
      error: "Backup creation failed",
      errorDetails: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// File Download
// ============================================================================

/**
 * Download backup as JSON file
 */
export function downloadBackup(backup: BackupRoot, fileName: string): void {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();

  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// ============================================================================
// Summary Generation
// ============================================================================

/**
 * Generate human-readable backup summary
 */
export function generateBackupSummary(backup: BackupRoot): BackupSummary {
  const json = JSON.stringify(backup);
  const sizeBytes = new Blob([json]).size;

  const counts = backup.integrity.record_counts;

  return {
    portfolios: counts["portfolio"] ?? 0,
    depots: counts["depot"] ?? 0,
    securities: counts["security"] ?? 0,
    dividendPayments: counts["dividend_payment"] ?? 0,
    goals: counts["goal"] ?? 0,
    imports: counts["import"] ?? 0,
    totalSize: formatBytes(sizeBytes),
    exportedAt: backup.exported_at,
  };
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
