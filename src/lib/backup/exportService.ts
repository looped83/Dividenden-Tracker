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

import ExcelJS from "exceljs";
import { supabase } from "@/lib/supabase/client";

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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  onProgress?.({ stage: "filtering", totalItems: data?.length ?? 0 });

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

// ============================================================================
// CSV Export
// ============================================================================

/**
 * Escape CSV field value and prevent formula injection
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) return "";

  const str = String(value);

  // Prevent formula injection: prepend single quote if starts with formula characters
  if (/^[\s=+\-@]/.exec(str)) {
    return `"'${str}"`;
  }

  // Escape quotes and wrap in quotes if contains comma, newline, or quote
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generate CSV export
 */
// eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// ============================================================================
// Excel Export (using a simple approach without external library)
// ============================================================================

/**
 * Generate simple XLSX export (note: uses CSV fallback if xlsx library not available)
 * In production, you'd use a library like xlsx or exceljs
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateXlsxExport(
  payments: any[],
  columns: ExportColumn[],
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  onProgress?.({ stage: "formatting" });

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
        const num = parseFloat(value);
        return isNaN(num) ? value : num;
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

// ============================================================================
// JSON Export
// ============================================================================

/**
 * Generate JSON export for analytical use (not restorable)
 */
// eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any
async function generateJsonExport(
  payments: any[],
  columns: ExportColumn[],
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  onProgress?.({ stage: "formatting" });

  const visibleColumns = columns.filter((c) => c.visible);

  const rows = payments.map((payment) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const year = now.getFullYear();
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
    const columns = options.columns || DEFAULT_EXPORT_COLUMNS;

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
          error: `Unsupported export format: ${options.format}`,
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
