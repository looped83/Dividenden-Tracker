/**
 * Sicherung: laedt den vollstaendigen Datenbestand des angemeldeten Nutzers,
 * schreibt ihn in das Sicherungsformat (BACKUP_AND_RESTORE.md), berechnet den
 * Integritaetsblock und liefert die Datei zum Herunterladen.
 *
 * Zwei Regeln bestimmen den Aufbau, beide aus derselben Erfahrung:
 *
 * 1. **Vollstaendig oder gar nicht.** Jede Abfrage laeuft ueber
 *    {@link fetchAllPages}; ein Fehler wird weitergereicht statt zu einer
 *    leeren Liste zu werden. Zusaetzlich wird die geladene Zeilenzahl gegen
 *    `count` der Datenbank geprueft. Eine fehlende Sicherung ist harmlos,
 *    eine unvollstaendige nicht — und man sieht ihr nichts an.
 * 2. **Erfolg heisst: Datei liegt vor.** `createBackup` erzeugt nur die
 *    Daten; erst {@link downloadBackup} macht sie zur Sicherung. Die
 *    Oberflaeche meldet Erfolg deshalb erst nach dem Herunterladen und
 *    schreibt erst dann `profiles.last_backup_at`.
 */

import Decimal from "decimal.js";
import { supabase } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import type { Database } from "@/lib/supabase/database.types";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  toIsoTimestamp,
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
  type SecurityAliasBackup,
  type SnapshotRunBackup,
  type SecuritySnapshotBackup,
} from "./backupFormat";

// ============================================================================
// Types
// ============================================================================

/**
 * Hoechste Migrationsnummer, gegen die dieses Format geprueft wurde. Beim
 * Anlegen einer Migration, die eine gesicherte Tabelle veraendert, hier
 * nachziehen — `validateBackupVersion` entscheidet daran, ob eine aeltere
 * Sicherung noch eingespielt werden darf.
 */
const SCHEMA_VERSION = "0031";

/**
 * Version der Anwendung, zur Bauzeit aus `package.json` eingesetzt
 * (`vite.config.ts`). Sie steht in jeder Sicherungsdatei und beantwortet
 * spaeter die Frage, welcher Stand sie geschrieben hat.
 */
const APP_VERSION = __APP_VERSION__;

/** Tabellenzeilen, wie sie aus der Datenbank kommen (vor der Abbildung aufs Format). */
type Tables = Database["public"]["Tables"];
type PortfolioRow = Tables["portfolios"]["Row"];
type DepotRow = Tables["depots"]["Row"];
type SecurityRow = Tables["securities"]["Row"];
type DividendPaymentRow = Tables["dividend_payments"]["Row"];
type GoalRow = Tables["goals"]["Row"];
type ImportRow = Tables["imports"]["Row"];
type SecurityAliasRow = Tables["security_aliases"]["Row"];
type SnapshotRunRow = Tables["security_snapshot_runs"]["Row"];
type SecuritySnapshotRow = Tables["security_snapshots"]["Row"];

export interface BackupProgress {
  stage:
    | "fetching_profiles"
    | "fetching_data"
    | "serializing"
    | "generating"
    | "reading_file"
    | "validating"
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
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
 * Zeitstempel aus der Datenbank in die kanonische Form der Sicherungsdatei.
 *
 * PostgREST liefert `timestamptz` als `2025-06-15T10:30:00.123456+00:00` —
 * Zeitzonenversatz statt `Z`, Mikrosekunden statt Millisekunden. Ungeprueft
 * uebernommen entstand eine Datei, die die eigene Formatpruefung nicht
 * bestand und sich damit nicht wiederherstellen liess.
 */
function ts(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  const normalized = toIsoTimestamp(value);
  if (normalized === null) {
    throw new Error(`Unlesbarer Zeitstempel in den Daten: "${value}".`);
  }
  return normalized;
}

/**
 * Format date as YYYY-MM-DD (business date, no timezone)
 */
function formatBusinessDate(date: Date | string): string {
  if (typeof date === "string") {
    return date; // Already formatted
  }
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Convert numeric(14,2) from Supabase (might be string or number) to decimal string
 */
function ensureDecimalString(value: unknown, maxDecimals = 2): string | null {
  if (value === null || value === undefined) return null;

  // Ein unlesbarer Betrag bricht die Sicherung ab, statt still als `null` in
  // der Datei zu landen: Bei einem Geldwert ist „fehlt" schlimmer als „Fehler".
  try {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const d = new Decimal(String(value));
    return d.toFixed(maxDecimals);
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    throw new Error(`Unlesbarer Betrag in den Daten: "${String(value)}".`);
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
        const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
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
 * Zaehlt die Zeilen einer Tabelle serverseitig (nur Kopf, keine Daten). Dient
 * ausschliesslich der Gegenprobe zur geladenen Menge — siehe {@link assertComplete}.
 */
async function countRows(
  table: "dividend_payments" | "securities" | "security_snapshots",
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Bricht ab, wenn weniger geladen wurde als die Datenbank fuehrt.
 *
 * Die Paginierung in {@link fetchAllPages} macht eine Kappung bereits
 * unmoeglich; diese zweite Kontrolle faengt alles ab, was dahinter liegt
 * (geaenderte Serverlimits, ein Fehler, der kuenftig doch verschluckt wird,
 * gleichzeitige Aenderungen waehrend des Ladens). Eine Sicherung ist der
 * einzige Ort, an dem sich dieser Aufwand immer lohnt: Man merkt eine Luecke
 * erst, wenn man die Sicherung braucht.
 */
function assertComplete(loaded: number, expected: number, label: string): void {
  if (loaded < expected) {
    throw new Error(
      `Die Sicherung wurde abgebrochen: Es wurden ${String(loaded)} von ${String(expected)} ${label} geladen. ` +
        "Es wurde nichts gespeichert. Bitte erneut versuchen.",
    );
  }
}

/**
 * Laedt das Profil des angemeldeten Nutzers.
 */
async function fetchProfile(): Promise<ProfileBackup | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .single();

  if (error) throw new Error(error.message);

  return removeNulls({
    id: data.id,
    base_currency: data.base_currency,
    locale: data.locale,
    theme: data.theme,
    backup_reminder_days: data.backup_reminder_days,
    last_backup_at: ts(data.last_backup_at),
    created_at: ts(data.created_at),
    updated_at: ts(data.updated_at),
  }) as ProfileBackup;
}

/**
 * Laedt alle Portfolios.
 */
async function fetchPortfolios(): Promise<PortfolioBackup[]> {
  const data = await fetchAllPages<PortfolioRow>((from, to) =>
    supabase
      .from("portfolios")
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return data.map(
    (p) =>
      removeNulls({
        id: p.id,
        user_id: p.user_id,
        name: p.name,
        note: p.note,
        created_at: ts(p.created_at),
        updated_at: ts(p.updated_at),
        archived_at: ts(p.archived_at),
      }) as PortfolioBackup,
  );
}

/**
 * Laedt alle Depots.
 */
async function fetchDepots(): Promise<DepotBackup[]> {
  const data = await fetchAllPages<DepotRow>((from, to) =>
    supabase
      .from("depots")
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return data.map(
    (d) =>
      removeNulls({
        id: d.id,
        user_id: d.user_id,
        name: d.name,
        broker: d.broker,
        base_currency: d.base_currency,
        portfolio_id: d.portfolio_id,
        note: d.note,
        created_at: ts(d.created_at),
        updated_at: ts(d.updated_at),
        archived_at: ts(d.archived_at),
      }) as DepotBackup,
  );
}

/**
 * Laedt alle Unternehmen und prueft die Menge gegen die Datenbank.
 */
async function fetchSecurities(): Promise<SecurityBackup[]> {
  const [expected, data] = await Promise.all([
    countRows("securities"),
    fetchAllPages<SecurityRow>((from, to) =>
      supabase
        .from("securities")
        .select("*")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  assertComplete(data.length, expected, "Unternehmen");

  return data.map(
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
        created_at: ts(s.created_at),
        updated_at: ts(s.updated_at),
        archived_at: ts(s.archived_at),
      }) as SecurityBackup,
  );
}

/**
 * Laedt **alle** Dividendeneingaenge einschliesslich der stornierten und prueft
 * die Menge gegen die Datenbank. Dies ist der Datensatz, dessen Verlust nicht
 * wiedergutzumachen waere — deshalb hier die strengste Kontrolle.
 */
async function fetchDividendPayments(): Promise<DividendPaymentBackup[]> {
  const [expected, data] = await Promise.all([
    countRows("dividend_payments"),
    fetchAllPages<DividendPaymentRow>((from, to) =>
      supabase
        .from("dividend_payments")
        .select("*")
        // `pay_date` ist nicht eindeutig — `id` als Tiebreaker, sonst kann eine
        // Zeile ueber die Seitengrenze hinweg doppelt oder gar nicht erscheinen.
        .order("pay_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  assertComplete(data.length, expected, "Dividendeneingänge");

  return data.map(
    (p) =>
      removeNulls({
        id: p.id,
        user_id: p.user_id,
        security_id: p.security_id,
        depot_id: p.depot_id,
        import_id: p.import_id,
        pay_date: formatBusinessDate(p.pay_date),
        gross_amount: ensureDecimalString(p.gross_amount, 2) ?? "0.00",
        net_amount: ensureDecimalString(p.net_amount, 2) ?? "0.00",
        withholding_tax: ensureDecimalString(p.withholding_tax, 2) ?? "0.00",
        domestic_tax: ensureDecimalString(p.domestic_tax, 2) ?? "0.00",
        solidarity_surcharge: ensureDecimalString(p.solidarity_surcharge, 2) ?? "0.00",
        church_tax: ensureDecimalString(p.church_tax, 2) ?? "0.00",
        fees: ensureDecimalString(p.fees, 2) ?? "0.00",
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
        created_at: ts(p.created_at),
        updated_at: ts(p.updated_at),
        archived_at: ts(p.archived_at),
        archive_reason: p.archive_reason,
      }) as DividendPaymentBackup,
  );
}

/**
 * Laedt alle Ziele.
 */
async function fetchGoals(): Promise<GoalBackup[]> {
  const data = await fetchAllPages<GoalRow>((from, to) =>
    supabase
      .from("goals")
      .select("*")
      .order("year", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return data.map(
    (g) =>
      removeNulls({
        id: g.id,
        user_id: g.user_id,
        goal_type: g.goal_type,
        year: g.year,
        month: g.month,
        target_amount: ensureDecimalString(g.target_amount, 2) ?? "0.00",
        currency: g.currency,
        title: g.title,
        note: g.note,
        created_at: ts(g.created_at),
        updated_at: ts(g.updated_at),
      }) as GoalBackup,
  );
}

/**
 * Laedt die Importvorgaenge (nur die Metadaten, nicht die Rohzeilen).
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
async function fetchImports(): Promise<ImportBackup[]> {
  const data = await fetchAllPages<ImportRow>((from, to) =>
    supabase
      .from("imports")
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return data.map(
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
        created_at: ts(i.created_at),
        committed_at: ts(i.committed_at),
        rolled_back_at: ts(i.rolled_back_at),
      }) as ImportBackup,
  );
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment */

/**
 * Laedt die beim Import bestaetigten Schreibweisen (IMPORT_SPEC.md §6).
 *
 * Sie sind zwar aus den Zahlungen nicht ableitbar, aber ersetzbar — der Nutzer
 * muesste jede Zuordnung erneut bestaetigen. Genau diese Arbeit soll eine
 * Sicherung ihm ersparen.
 */
async function fetchSecurityAliases(): Promise<SecurityAliasBackup[]> {
  const data = await fetchAllPages<SecurityAliasRow>((from, to) =>
    supabase
      .from("security_aliases")
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return data.map(
    (a) =>
      removeNulls({
        id: a.id,
        user_id: a.user_id,
        alias_normalized: a.alias_normalized,
        security_id: a.security_id,
        source_import_id: a.source_import_id,
        created_at: ts(a.created_at),
      }) as SecurityAliasBackup,
  );
}

/**
 * Laedt die Upload-Laeufe der Depotstaende (docs/PORTFOLIO_IMPORT.md §6).
 */
async function fetchSnapshotRuns(): Promise<SnapshotRunBackup[]> {
  const data = await fetchAllPages<SnapshotRunRow>((from, to) =>
    supabase
      .from("security_snapshot_runs")
      .select("*")
      .order("as_of", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return data.map(
    (r) =>
      removeNulls({
        id: r.id,
        user_id: r.user_id,
        as_of: formatBusinessDate(r.as_of),
        source: r.source,
        file_name: r.file_name,
        rows_total: r.rows_total,
        rows_imported: r.rows_imported,
        rows_skipped: r.rows_skipped,
        rows_invalid: r.rows_invalid,
        created_at: ts(r.created_at),
      }) as SnapshotRunBackup,
  );
}

/**
 * Laedt alle Depotstaende und prueft die Menge gegen die Datenbank.
 *
 * Dieselbe strenge Kontrolle wie bei den Dividendeneingaengen, und aus
 * demselben Grund: DivvyDiary exportiert immer nur den **heutigen** Stand.
 * Geht die Zeile eines vergangenen Stichtags verloren, ist dieser Tag
 * endgueltig weg — anders als die Kalendertermine, die ein erneuter
 * Feed-Abgleich wieder aufbaut, und anders als die Marktdaten von heute, die
 * der naechste Upload ohnehin liefert.
 */
async function fetchSecuritySnapshots(): Promise<SecuritySnapshotBackup[]> {
  const [expected, data] = await Promise.all([
    countRows("security_snapshots"),
    fetchAllPages<SecuritySnapshotRow>((from, to) =>
      supabase
        .from("security_snapshots")
        .select("*")
        // `as_of` ist nicht eindeutig — `id` als Tiebreaker, sonst kann eine
        // Zeile ueber die Seitengrenze hinweg doppelt oder gar nicht erscheinen.
        .order("as_of", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  assertComplete(data.length, expected, "Depotstände");

  return data.map(
    (s) =>
      removeNulls({
        id: s.id,
        user_id: s.user_id,
        security_id: s.security_id,
        run_id: s.run_id,
        as_of: formatBusinessDate(s.as_of),
        quantity: ensureDecimalString(s.quantity, 6) ?? "0",
        buyin_per_share: ensureDecimalString(s.buyin_per_share, 6),
        buyin_total: ensureDecimalString(s.buyin_total, 2),
        price: ensureDecimalString(s.price, 6),
        market_value: ensureDecimalString(s.market_value, 2),
        gain_absolute: ensureDecimalString(s.gain_absolute, 2),
        gain_relative: ensureDecimalString(s.gain_relative, 6),
        allocation: ensureDecimalString(s.allocation, 6),
        dividend_yield: ensureDecimalString(s.dividend_yield, 6),
        dividend_yield_on_buyin: ensureDecimalString(s.dividend_yield_on_buyin, 6),
        annual_dividend_total: ensureDecimalString(s.annual_dividend_total, 2),
        dividend_per_share: ensureDecimalString(s.dividend_per_share, 6),
        dividend_frequency: s.dividend_frequency,
        dividend_cagr: ensureDecimalString(s.dividend_cagr, 6),
        dividend_cagr_period: s.dividend_cagr_period,
        next_ex_date: s.next_ex_date === null ? null : formatBusinessDate(s.next_ex_date),
        next_pay_date:
          s.next_pay_date === null ? null : formatBusinessDate(s.next_pay_date),
        asset_type: s.asset_type,
        currency: s.currency,
        created_at: ts(s.created_at),
      }) as SecuritySnapshotBackup,
  );
}

// ============================================================================
// Checksum Computation
// ============================================================================

/**
 * Compute SHA-256 checksum for a data array
 * Serializes with deterministic ordering (by ID)
 */
/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
async function computeChecksum(data: unknown[]): Promise<string> {
  const sorted = (data as any[]).sort((a: any, b: any) => {
    const aId = a.id ?? "";
    const bId = b.id ?? "";
    return String(aId).localeCompare(String(bId));
  });

  const canonical = JSON.stringify(sorted, (_key, value) => {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, any>>((obj, k: string) => {
          obj[k] = (value as Record<string, any>)[k];
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
/* eslint-enable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */

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
    security_alias: data.security_aliases.length,
    security_snapshot_run: data.security_snapshot_runs.length,
    security_snapshot: data.security_snapshots.length,
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
  if (data.security_aliases.length > 0) {
    checksums["security_aliases"] = await computeChecksum(data.security_aliases);
  }
  if (data.security_snapshot_runs.length > 0) {
    checksums["security_snapshot_runs"] = await computeChecksum(
      data.security_snapshot_runs,
    );
  }
  if (data.security_snapshots.length > 0) {
    checksums["security_snapshots"] = await computeChecksum(data.security_snapshots);
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
        error: "Es ist keine Anmeldung aktiv.",
        errorDetails:
          "Das Profil konnte nicht geladen werden. Bitte melde dich erneut an.",
      };
    }

    // Fetch all data
    onProgress?.({ stage: "fetching_data" });
    const [
      portfolios,
      depots,
      securities,
      dividendPayments,
      goals,
      imports,
      securityAliases,
      snapshotRuns,
      securitySnapshots,
    ] = await Promise.all([
      fetchPortfolios(),
      fetchDepots(),
      fetchSecurities(),
      fetchDividendPayments(),
      fetchGoals(),
      fetchImports(),
      fetchSecurityAliases(),
      fetchSnapshotRuns(),
      fetchSecuritySnapshots(),
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
      security_aliases: securityAliases,
      security_snapshot_runs: snapshotRuns,
      security_snapshots: securitySnapshots,
    };

    // Compute integrity info
    const integrity = await computeIntegrity(data);

    // Build root backup object
    onProgress?.({ stage: "generating" });
    const backup: BackupRoot = {
      format: BACKUP_FORMAT,
      format_version: BACKUP_FORMAT_VERSION,
      schema_version: SCHEMA_VERSION,
      app_version: APP_VERSION,
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
    return {
      success: false,
      error: "Die Sicherung konnte nicht erstellt werden.",
      errorDetails: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Herunterladen und Sicherungszeitpunkt
// ============================================================================

/**
 * Bietet die Sicherung als Datei zum Herunterladen an.
 *
 * `URL.revokeObjectURL` folgt bewusst erst im naechsten Makrotask: Safari auf
 * iOS und iPadOS bricht den Download ab, wenn die Objekt-URL noch im selben
 * Durchlauf wie der Klick freigegeben wird. Auf genau diesen Geraeten soll die
 * Sicherung funktionieren.
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
  a.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * Haelt den Zeitpunkt der letzten Sicherung fest (`profiles.last_backup_at`,
 * BACKUP_AND_RESTORE.md §4). Wird **nur** nach dem tatsaechlichen Herunterladen
 * aufgerufen — ein erzeugter, aber nie gespeicherter Datensatz ist keine
 * Sicherung.
 *
 * Ein Fehler hierbei bleibt folgenlos fuer die Sicherung selbst: Die Datei
 * liegt bereits vor. Er wird deshalb gemeldet, aber nicht als Fehlschlag
 * behandelt.
 */
export async function markBackupCompleted(): Promise<{ at: string } | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const at = getCurrentTimestamp();
  const { error } = await supabase
    .from("profiles")
    .update({ last_backup_at: at })
    .eq("id", auth.user.id);
  if (error) return null;
  return { at };
}

/** Liest den Zeitpunkt der letzten Sicherung fuer die Anzeige im Bereich. */
export async function fetchLastBackupAt(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("last_backup_at")
    .eq("id", auth.user.id)
    .single();
  if (error) throw new Error(error.message);
  return data.last_backup_at;
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
  return `${String(Math.round((bytes / Math.pow(k, i)) * 100) / 100)} ${sizes[i]}`;
}
