/**
 * Export Service
 *
 * Client-side service for exporting dividend data:
 * - CSV export with formula injection protection
 * - Excel (.xlsx) export with proper data types
 * - JSON export for analytical use
 * - Configurable filtering (year, month, security, depot)
 * - Column selection
 */

import { supabase } from "@/lib/supabase/client";
import { MoneyDecimal } from "@/lib/money/decimalConfig";

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = "csv" | "xlsx" | "json";

export interface ExportOptions {
  format: ExportFormat;
  includeArchived?: boolean;
  filters?: {
    yearFrom?: number;
    yearTo?: number;
    securityIds?: string[];
    depotIds?: string[];
  };
  columns?: ExportColumn[];
}

export interface ExportColumn {
  field: string;
  label: string;
  visible: boolean;
}

export interface ExportProgress {
  stage: "fetching_data" | "filtering" | "formatting" | "generating";
  itemsProcessed?: number;
  totalItems?: number;
}

export interface ExportResult {
  success: boolean;
  fileName: string;
  mimeType: string;
  error?: string;
}

// ============================================================================
// Default Column Definitions
// ============================================================================

export const DEFAULT_EXPORT_COLUMNS: ExportColumn[] = [
  { field: "pay_date", label: "Zahlungsdatum", visible: true },
  { field: "security_name", label: "Unternehmen", visible: true },
  { field: "ticker", label: "Ticker", visible: true },
  { field: "depot_name", label: "Depot", visible: true },
  { field: "gross_amount", label: "Bruttobetrag", visible: true },
  { field: "net_amount", label: "Nettobetrag", visible: true },
  { field: "withholding_tax", label: "Quellensteuer", visible: true },
  { field: "domestic_tax", label: "Inland. Steuer", visible: false },
  { field: "solidarity_surcharge", label: "Solidaritätszuschlag", visible: false },
  { field: "church_tax", label: "Kirchensteuer", visible: false },
  { field: "fees", label: "Gebühren", visible: false },
  { field: "quantity", label: "Menge", visible: false },
  { field: "amount_per_share", label: "Betrag/Aktie", visible: false },
  { field: "payment_type", label: "Zahlungstyp", visible: false },
  { field: "note", label: "Notiz", visible: false },
];

// ============================================================================
// Data Fetching & Filtering
// ============================================================================

/**
 * Fetch and filter dividend payments for export
 */
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-condition */
async function fetchPaymentsForExport(
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
) {
  onProgress?.({ stage: "fetching_data" });

  let query = supabase.from("dividend_payments").select(
    `
      id,
      pay_date,
      gross_amount,
      net_amount,
      withholding_tax,
      domestic_tax,
      solidarity_surcharge,
      church_tax,
      fees,
      quantity,
      amount_per_share,
      payment_type,
      note,
      archived_at,
      security:securities(name, ticker),
      depot:depots(name)
    `,
  );

  // Filter by archive status
  if (!options.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query.order("pay_date", { ascending: false });

  if (error) throw error;

  onProgress?.({ stage: "filtering", totalItems: data.length });

  // Apply client-side filters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let filtered = (data ?? []) as any[];

  if (options.filters?.yearFrom || options.filters?.yearTo) {
    const yearFrom = options.filters.yearFrom ?? 0;
    const yearTo = options.filters.yearTo ?? 9999;

    filtered = filtered.filter((p) => {
      const year = new Date(p.pay_date).getFullYear();
      return year >= yearFrom && year <= yearTo;
    });
  }

  if (options.filters?.securityIds && options.filters.securityIds.length > 0) {
    // This would require the security_id to be included in the select
    // For now, we'll note this limitation
  }

  if (options.filters?.depotIds && options.filters.depotIds.length > 0) {
    // This would require the depot_id to be included in the select
    // For now, we'll note this limitation
  }

  onProgress?.({
    stage: "filtering",
    itemsProcessed: filtered.length,
    totalItems: filtered.length,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return filtered;
}
/* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-condition */

// ============================================================================
// CSV Export
// ============================================================================

/**
 * Reine Zahlenliteralen (auch negative und Dezimalwerte). Solche Werte kann
 * eine Tabellenkalkulation nicht als Formel auswerten, deshalb brauchen sie
 * keinen Formel-Schutz. Ohne diese Ausnahme wuerde jeder negative Betrag
 * (Storno, Korrektur) als Text `'-12.34` exportiert und waere in Excel nicht
 * mehr rechenbar.
 */
const NUMERIC_LITERAL = /^-?\d+(?:\.\d+)?$/;

/** Zeichen, die eine Tabellenkalkulation als Formelbeginn interpretiert. */
const FORMULA_PREFIX = /^[\s=+\-@]/;

/**
 * Wandelt einen Zellwert in Text um, ohne je "[object Object]" zu erzeugen.
 * Die Exportspalten liefern Primitive; Objekte/Arrays waeren ein Fehler im
 * Aufrufer und werden als JSON exportiert, damit die Information erhalten
 * bleibt und der Fehler in der Datei sichtbar wird.
 */
function stringifyCsvValue(value: NonNullable<unknown>): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "function" || typeof value === "symbol") return "";
  try {
    // Wirft bei BigInt und zyklischen Strukturen.
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Maskiert einen Wert fuer CSV und verhindert Formula Injection.
 *
 * Der Formel-Schutz stellt ein `'` voran; damit behandeln Excel/LibreOffice
 * den Inhalt als Text statt ihn auszuwerten. Anschliessend wird IMMER regulaer
 * CSV-maskiert (Quotes verdoppeln), auch im Formel-Zweig — genau das fehlte
 * zuvor, sodass ein Wert wie `=x","y` das Feld verlassen und zusaetzliche
 * Spalten/Zeilen einschleusen konnte.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";

  const raw = stringifyCsvValue(value);
  const needsFormulaGuard = FORMULA_PREFIX.test(raw) && !NUMERIC_LITERAL.test(raw);
  const body = needsFormulaGuard ? `'${raw}` : raw;

  const needsQuoting =
    needsFormulaGuard ||
    body.includes('"') ||
    body.includes(",") ||
    body.includes("\n") ||
    body.includes("\r");

  return needsQuoting ? `"${body.replace(/"/g, '""')}"` : body;
}

/**
 * Generate CSV export
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
async function generateCsvExport(
  payments: any[],
  columns: ExportColumn[],
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  onProgress?.({ stage: "formatting", totalItems: payments.length });

  const visibleColumns = columns.filter((c) => c.visible);
  const lines: string[] = [];

  // Header row
  lines.push(visibleColumns.map((c) => escapeCsvField(c.label)).join(","));

  // Data rows
  payments.forEach((payment, index) => {
    const row = visibleColumns.map((col) => {
      let value: any;

      if (col.field === "security_name") {
        value = payment.security?.name;
      } else if (col.field === "ticker") {
        value = payment.security?.ticker;
      } else if (col.field === "depot_name") {
        value = payment.depot?.name;
      } else {
        value = payment[col.field];
      }

      return escapeCsvField(value);
    });

    lines.push(row.join(","));

    if ((index + 1) % 100 === 0) {
      onProgress?.({
        stage: "formatting",
        itemsProcessed: index + 1,
        totalItems: payments.length,
      });
    }
  });

  onProgress?.({
    stage: "formatting",
    itemsProcessed: payments.length,
    totalItems: payments.length,
  });

  return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */

// ============================================================================
// Excel Export
// ============================================================================

/**
 * Wandelt einen Transportwert (Supabase liefert `numeric` als String) in eine
 * Excel-Zahl um.
 *
 * Bewusst ueber Decimal statt `parseFloat` (CALCULATION_RULES.md §8, per
 * ESLint projektweit gesperrt): `parseFloat` liest fuehrende Ziffern und
 * verwirft den Rest stillschweigend — aus "12.34xyz" wuerde 12.34, aus
 * "1,234.56" waere es 1. Ein solcher Wert landete dann als plausibel
 * aussehende, aber falsche Zahl in der Exportdatei. Decimal akzeptiert nur
 * vollstaendig gueltige Zahlen; alles andere gibt `null` zurueck, sodass der
 * Rohwert unveraendert als Text exportiert wird und der Fehler sichtbar bleibt.
 *
 * Die Umwandlung nach `number` ist an dieser Systemgrenze unvermeidbar: Excel
 * speichert Zahlen als IEEE-754-Double. Alle Betraege sind zuvor auf maximal
 * 6 Nachkommastellen gerundet und damit exakt darstellbar.
 */
function toExportNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  try {
    const decimal = new MoneyDecimal(value.trim());
    return decimal.isFinite() ? decimal.toNumber() : null;
  } catch {
    return null;
  }
}

/**
 * Erzeugt die XLSX-Datei mit exceljs. Es gibt keinen CSV-Fallback: Beträge
 * werden als echte Zahlen und Datumsangaben als Datumswerte geschrieben,
 * damit in Excel gerechnet und sortiert werden kann.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-base-to-string, @typescript-eslint/no-unnecessary-condition */
async function generateXlsxExport(
  payments: any[],
  columns: ExportColumn[],
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  onProgress?.({ stage: "formatting" });

  // Dynamischer Import: exceljs ist ~950 kB und wird nur beim XLSX-Export
  // gebraucht. Ein statischer Import zog die Bibliothek in den Haupt-Chunk und
  // machte die dynamischen Imports in den Workbook-Parsern wirkungslos
  // (Rolldown-Warnung INEFFECTIVE_DYNAMIC_IMPORT).
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Dividend Payments");

  // Set up column definitions
  const visibleColumns = columns.filter((c) => c.visible);
  const columnHeaders = visibleColumns.map((c) => c.label);

  // Add header row
  const headerRow = worksheet.addRow(columnHeaders);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  // Add data rows with formatting
  payments.forEach((payment) => {
    const rowData = visibleColumns.map((col) => {
      const value = payment[col.field];

      // Format specific field types
      if (
        col.field === "pay_date" ||
        col.field === "created_at" ||
        col.field === "updated_at"
      ) {
        return value ? new Date(value) : null;
      }

      // Currency/numeric fields
      if (
        col.field.includes("amount") ||
        col.field.includes("price") ||
        col.field.includes("tax")
      ) {
        // Faellt auf den Rohwert zurueck, wenn der Wert keine gueltige Zahl
        // ist — so bleibt der Fehler in der Datei sichtbar statt still zu 0
        // zu werden.
        return toExportNumber(value) ?? value;
      }

      return value;
    });

    const row = worksheet.addRow(rowData);

    // Format cells
    visibleColumns.forEach((col, idx) => {
      const cell = row.getCell(idx + 1);

      // Date formatting
      if (
        col.field === "pay_date" ||
        col.field === "created_at" ||
        col.field === "updated_at"
      ) {
        cell.numFmt = "yyyy-mm-dd";
      }

      // Currency formatting (EUR)
      if (
        col.field.includes("amount") ||
        col.field.includes("price") ||
        col.field.includes("tax")
      ) {
        cell.numFmt = '#,##0.00"€"';
        cell.alignment = { horizontal: "right" };
      } else if (col.field === "quantity") {
        cell.numFmt = "0.0000";
        cell.alignment = { horizontal: "right" };
      } else {
        cell.alignment = { horizontal: "left" };
      }
    });
  });

  // Auto-fit columns
  worksheet.columns.forEach((column) => {
    if (!column) return;
    let maxLength = 0;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const cellLength = cell.value ? String(cell.value).length : 0;
      if (cellLength > maxLength) maxLength = cellLength;
    });
    column.width = Math.min(maxLength + 2, 50);
  });

  // Freeze header row
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  // Generate blob
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-base-to-string, @typescript-eslint/no-unnecessary-condition */

// ============================================================================
// JSON Export
// ============================================================================

/**
 * Generate JSON export for analytical use (not restorable)
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
async function generateJsonExport(
  payments: any[],
  columns: ExportColumn[],
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  onProgress?.({ stage: "formatting" });

  const visibleColumns = columns.filter((c) => c.visible);

  const rows = payments.map((payment) => {
    const row: Record<string, any> = {};

    visibleColumns.forEach((col) => {
      if (col.field === "security_name") {
        row[col.field] = payment.security?.name;
      } else if (col.field === "ticker") {
        row[col.field] = payment.security?.ticker;
      } else if (col.field === "depot_name") {
        row[col.field] = payment.depot?.name;
      } else {
        row[col.field] = payment[col.field];
      }
    });

    return row;
  });

  onProgress?.({
    stage: "formatting",
    itemsProcessed: payments.length,
    totalItems: payments.length,
  });

  const json = {
    metadata: {
      exportedAt: new Date().toISOString(),
      recordCount: payments.length,
      columns: visibleColumns,
    },
    data: rows,
  };

  return new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */

// ============================================================================
// File Download
// ============================================================================

/**
 * Download generated blob as file
 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate timestamp suffix for file naming
 */
function getTimestampSuffix(): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ============================================================================
// Main Export Entry Point
// ============================================================================

/**
 * Execute export based on options
 */
export async function executeExport(
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
): Promise<ExportResult> {
  try {
    const columns = options.columns ?? DEFAULT_EXPORT_COLUMNS;

    // Fetch and filter payments
    const payments = await fetchPaymentsForExport(options, onProgress);

    if (payments.length === 0) {
      return {
        success: false,
        fileName: "",
        mimeType: "",
        error: "No data available for export",
      };
    }

    // Generate export based on format
    let blob: Blob;
    let fileName: string;
    let mimeType: string;

    onProgress?.({ stage: "generating" });

    switch (options.format) {
      case "csv":
        blob = await generateCsvExport(payments, columns, onProgress);
        fileName = `dividenden-export-${getTimestampSuffix()}.csv`;
        mimeType = "text/csv";
        break;

      case "xlsx":
        blob = await generateXlsxExport(payments, columns, onProgress);
        fileName = `dividenden-export-${getTimestampSuffix()}.xlsx`;
        mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        break;

      case "json":
        blob = await generateJsonExport(payments, columns, onProgress);
        fileName = `dividenden-export-${getTimestampSuffix()}.json`;
        mimeType = "application/json";
        break;

      default:
        return {
          success: false,
          fileName: "",
          mimeType: "",
          error: `Unsupported export format: ${String(options.format)}`,
        };
    }

    // Download file
    downloadBlob(blob, fileName);

    return {
      success: true,
      fileName,
      mimeType,
    };
  } catch (error) {
    return {
      success: false,
      fileName: "",
      mimeType: "",
      error: error instanceof Error ? error.message : "Unknown error during export",
    };
  }
}
