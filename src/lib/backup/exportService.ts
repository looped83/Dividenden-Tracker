/**
 * Datenexport: CSV und Excel.
 *
 * Abgrenzung zur Sicherung: Ein Export ist eine Datei zum **Weiterverarbeiten**
 * in einer Tabellenkalkulation und laesst sich nicht wieder einspielen; die
 * Sicherung ist der vollstaendige Bestand (backupService.ts). Beides in einer
 * Datei zu vermischen waere der sicherste Weg, im Ernstfall die falsche zu
 * greifen.
 *
 * Zwei Regeln halten die Datei ehrlich:
 *
 * 1. **Ein Wert, eine Herkunft.** Beide Formate lesen ihre Zellen ueber
 *    `exportCellValue`. Vorher hatte jedes Format seine eigene Zuordnung, und
 *    der Excel-Zweig kannte die verbundenen Tabellen nicht: `payment[field]`
 *    findet kein `security_name`, also blieben Unternehmen, Ticker und Depot
 *    in **jeder** XLSX-Datei leer.
 * 2. **Keine Spalte, die nichts enthaelt — und keine Angabe, die stillschweigend
 *    fehlt.** Welche Spalten in der Datei stehen, entscheidet der Bestand
 *    (`columnsFor`): Steuerarten, Menge oder Notiz erscheinen, sobald ein
 *    Eingang etwas darin stehen hat, und sonst nicht.
 *
 * Textfelder werden gegen Formula Injection geschuetzt (`escapeCsvField`) —
 * eine Exportdatei wird in einer Tabellenkalkulation geoeffnet, und ein Wert,
 * der dort ausgefuehrt wird, ist eine Sicherheitsluecke.
 */

import { supabase } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { MoneyDecimal } from "@/lib/money/decimalConfig";
import { describePaymentType } from "@/lib/payments/paymentType";
import type { PaymentType } from "@/lib/supabase/database.types";

// ============================================================================
// Typen
// ============================================================================

export type ExportFormat = "csv" | "xlsx";

export interface ExportOptions {
  format: ExportFormat;
  /** Stornierte Eingaenge mit ausgeben; sie tragen dann die Spalte „Storniert". */
  includeArchived?: boolean;
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

/**
 * Eine Zeile, wie die Abfrage sie liefert.
 *
 * Die Betragsfelder sind `string | number`: PostgREST gibt `numeric` je nach
 * Cast als JSON-Zahl **oder** als Text zurueck (dieselbe Vorsicht wie in
 * `lib/statistics/mapPayment`). Wer hier `string` annimmt, ruft `.trim()` auf
 * einer Zahl auf — und der Export bricht mit einer Meldung ab, die nichts
 * erklaert.
 */
export interface ExportPayment {
  pay_date: string | null;
  gross_amount: string | number | null;
  net_amount: string | number | null;
  withholding_tax: string | number | null;
  domestic_tax: string | number | null;
  solidarity_surcharge: string | number | null;
  church_tax: string | number | null;
  fees: string | number | null;
  quantity: string | number | null;
  amount_per_share: string | number | null;
  payment_type: PaymentType | null;
  original_currency: string | null;
  note: string | null;
  archived_at: string | null;
  security: { name: string | null; ticker: string | null } | null;
  depot: { name: string | null } | null;
}

export type ExportField =
  | "pay_date"
  | "security_name"
  | "ticker"
  | "depot_name"
  | "gross_amount"
  | "net_amount"
  | "withholding_tax"
  | "domestic_tax"
  | "solidarity_surcharge"
  | "church_tax"
  | "fees"
  | "quantity"
  | "amount_per_share"
  | "payment_type"
  | "original_currency"
  | "note"
  | "archived_at";

/**
 * Wie der Wert in der Zieldatei steht. Fruehere Fassung riet aus dem Feldnamen
 * (`field.includes("amount")`) — `fees` und `quantity` fielen durch das Raster
 * und landeten als Text in Excel, wo sie sich nicht summieren liessen.
 *
 * `money` sind die Betraege der Basiswaehrung mit genau zwei Nachkommastellen
 * (CALCULATION_RULES.md R-1); `decimal` sind Stueckzahl und Betrag je Anteil,
 * deren Skala aus der Quelle stammt und deshalb unveraendert bleibt.
 */
type ColumnKind = "date" | "money" | "decimal" | "text";

export interface ExportColumn {
  field: ExportField;
  label: string;
  kind: ColumnKind;
}

interface ColumnDefinition extends ExportColumn {
  /** Fehlt die Bedingung, steht die Spalte immer in der Datei. */
  include?: (payments: readonly ExportPayment[]) => boolean;
}

// ============================================================================
// Spalten
// ============================================================================

/** Hat mindestens ein Eingang in diesem Feld etwas stehen? */
function anyValue(
  payments: readonly ExportPayment[],
  field: ExportField,
  kind: ColumnKind,
): boolean {
  return payments.some((payment) => {
    const value = exportCellValue(payment, field);
    if (value === null || value === "") return false;
    // Eine Spalte aus lauter Nullen sagt dasselbe wie keine Spalte.
    if (kind === "money" || kind === "decimal") return toExportNumber(value) !== 0;
    return true;
  });
}

function whenFilled(field: ExportField, kind: ColumnKind) {
  return (payments: readonly ExportPayment[]) => anyValue(payments, field, kind);
}

/**
 * Alle Spalten in ihrer Reihenfolge. Die vier ohne Bedingung hat jeder Eingang;
 * ohne sie waere eine Zeile nicht lesbar.
 */
const COLUMNS: readonly ColumnDefinition[] = [
  { field: "pay_date", label: "Zahlungsdatum", kind: "date" },
  { field: "security_name", label: "Unternehmen", kind: "text" },
  {
    field: "ticker",
    label: "Ticker",
    kind: "text",
    include: whenFilled("ticker", "text"),
  },
  { field: "depot_name", label: "Depot", kind: "text" },
  {
    field: "gross_amount",
    label: "Bruttobetrag",
    kind: "money",
    include: whenFilled("gross_amount", "money"),
  },
  { field: "net_amount", label: "Nettobetrag", kind: "money" },
  {
    field: "withholding_tax",
    label: "Quellensteuer",
    kind: "money",
    include: whenFilled("withholding_tax", "money"),
  },
  {
    field: "domestic_tax",
    label: "Inländische Steuer",
    kind: "money",
    include: whenFilled("domestic_tax", "money"),
  },
  {
    field: "solidarity_surcharge",
    label: "Solidaritätszuschlag",
    kind: "money",
    include: whenFilled("solidarity_surcharge", "money"),
  },
  {
    field: "church_tax",
    label: "Kirchensteuer",
    kind: "money",
    include: whenFilled("church_tax", "money"),
  },
  {
    field: "fees",
    label: "Gebühren",
    kind: "money",
    include: whenFilled("fees", "money"),
  },
  {
    field: "quantity",
    label: "Menge",
    kind: "decimal",
    include: whenFilled("quantity", "decimal"),
  },
  {
    field: "amount_per_share",
    label: "Betrag je Anteil",
    kind: "decimal",
    include: whenFilled("amount_per_share", "decimal"),
  },
  {
    // Nicht, solange alles regulaer ist: Eine Spalte, in der zehntausendmal
    // „Regulär" steht, traegt nichts bei.
    field: "payment_type",
    label: "Zahlungsart",
    kind: "text",
    include: (payments) =>
      payments.some((p) => (p.payment_type ?? "regular") !== "regular"),
  },
  {
    // Nur bei gemischten Waehrungen; sonst sagt es das Zahlenformat.
    field: "original_currency",
    label: "Währung",
    kind: "text",
    include: (payments) => !allEuro(payments),
  },
  { field: "note", label: "Notiz", kind: "text", include: whenFilled("note", "text") },
  {
    field: "archived_at",
    label: "Storniert",
    kind: "text",
    include: whenFilled("archived_at", "text"),
  },
];

/** Sind alle Betraege in Euro? Entscheidet ueber Waehrungsspalte und Zahlenformat. */
function allEuro(payments: readonly ExportPayment[]): boolean {
  return payments.every((payment) => (payment.original_currency ?? "EUR") === "EUR");
}

/** Die Spalten, die dieser Bestand traegt — in fester Reihenfolge. */
export function columnsFor(payments: readonly ExportPayment[]): ExportColumn[] {
  return COLUMNS.filter((column) => !column.include || column.include(payments)).map(
    ({ field, label, kind }) => ({ field, label, kind }),
  );
}

/**
 * Der Wert einer Zelle als Text — die **einzige** Stelle, an der ein Feldname
 * auf einen Wert trifft. Verbundene Tabellen (Unternehmen, Depot) liegen
 * verschachtelt in der Antwort und sind ueber `payment[field]` nicht erreichbar.
 */
export function exportCellValue(
  payment: ExportPayment,
  field: ExportField,
): string | number | null {
  switch (field) {
    case "security_name":
      return payment.security?.name ?? null;
    case "ticker":
      return payment.security?.ticker ?? null;
    case "depot_name":
      return payment.depot?.name ?? null;
    case "payment_type":
      return payment.payment_type ? describePaymentType(payment.payment_type) : null;
    // Der Zeitstempel selbst interessiert hier nicht — die Zeile ist storniert
    // oder sie ist es nicht.
    case "archived_at":
      return payment.archived_at ? "ja" : null;
    default:
      return payment[field];
  }
}

// ============================================================================
// Zahlen
// ============================================================================

/**
 * Wandelt einen Transportwert (Supabase liefert `numeric` als String) in eine
 * Zahl um.
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
export function toExportNumber(value: string | number | null): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value.trim() === "") return null;
  try {
    const decimal = new MoneyDecimal(value.trim());
    return decimal.isFinite() ? decimal.toNumber() : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Daten laden
// ============================================================================

/** Die Felder der Abfrage; die verbundenen Tabellen liefern Namen und Ticker. */
const SELECT = `
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
  original_currency,
  note,
  archived_at,
  security:securities(name, ticker),
  depot:depots(name)
`;

async function fetchPaymentsForExport(
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
): Promise<ExportPayment[]> {
  onProgress?.({ stage: "fetching_data" });

  // Seitenweise (siehe fetchAllPages): Ohne Paginierung endete der Export
  // stillschweigend nach 1.000 Zeilen — bei vierstelliger Historie fehlte damit
  // ein knappes Drittel der Daten in jeder Exportdatei.
  const data = await fetchAllPages<ExportPayment>((from, to) => {
    const query = supabase
      .from("dividend_payments")
      .select(SELECT)
      // `id` als Tiebreaker: `pay_date` allein ist nicht eindeutig.
      .order("pay_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    return options.includeArchived ? query : query.is("archived_at", null);
  });

  onProgress?.({
    stage: "filtering",
    itemsProcessed: data.length,
    totalItems: data.length,
  });
  return data;
}

// ============================================================================
// CSV
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
 * Maskiert einen Wert fuer CSV und verhindert Formula Injection.
 *
 * Der Formel-Schutz stellt ein `'` voran; damit behandeln Excel/LibreOffice
 * den Inhalt als Text statt ihn auszuwerten. Anschliessend wird IMMER regulaer
 * CSV-maskiert (Quotes verdoppeln), auch im Formel-Zweig — genau das fehlte
 * zuvor, sodass ein Wert wie `=x","y` das Feld verlassen und zusaetzliche
 * Spalten/Zeilen einschleusen konnte.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  const raw = typeof value === "number" ? String(value) : value;
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
 * Der vollstaendige CSV-Text.
 *
 * `\r\n` als Zeilenende (RFC 4180) und ein vorangestelltes BOM: Ohne das BOM
 * liest Excel unter Windows die Datei in der Systemcodepage, und jeder Umlaut
 * in einem Unternehmensnamen kommt zerlegt an.
 */
export function buildCsvDocument(
  payments: readonly ExportPayment[],
  columns: readonly ExportColumn[],
): string {
  const lines = [columns.map((column) => escapeCsvField(column.label)).join(",")];
  for (const payment of payments) {
    lines.push(
      columns
        .map((column) =>
          escapeCsvField(
            csvCellValue(exportCellValue(payment, column.field), column.kind),
          ),
        )
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/**
 * Der Zellwert fuer CSV. Betraege der Basiswaehrung stehen mit zwei
 * Nachkommastellen in der Datei — kommt der Wert als JSON-Zahl an, sind die
 * Nullen am Ende bereits verloren, und aus 10,00 € wuerde sonst „10"
 * (CALCULATION_RULES.md R-6).
 */
function csvCellValue(value: string | number | null, kind: ColumnKind): string | null {
  if (value === null || value === "") return null;
  if (kind !== "money") return typeof value === "number" ? String(value) : value;
  const amount = toExportNumber(value);
  return amount === null ? String(value) : new MoneyDecimal(amount).toFixed(2);
}

// ============================================================================
// Excel
// ============================================================================

/** Der Zellwert fuer Excel: Datum als Datum, Betrag als Zahl, Rest als Text. */
function xlsxCellValue(
  raw: string | number | null,
  kind: ColumnKind,
): Date | number | string | null {
  if (raw === null || raw === "") return null;
  if (kind === "date") {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? String(raw) : date;
  }
  if (kind === "money" || kind === "decimal") {
    // Faellt auf den Rohwert zurueck, wenn der Wert keine gueltige Zahl ist —
    // so bleibt der Fehler in der Datei sichtbar statt still zu 0 zu werden.
    return toExportNumber(raw) ?? String(raw);
  }
  return typeof raw === "number" ? String(raw) : raw;
}

/** Zahlenformat je Spaltenart; Betraege tragen das Eurozeichen nur, wenn es stimmt. */
function numberFormat(kind: ColumnKind, euroOnly: boolean): string | null {
  if (kind === "date") return "dd.mm.yyyy";
  if (kind === "money") return euroOnly ? '#,##0.00 "€"' : "#,##0.00";
  // `decimal` bleibt im Standardformat: Stueckzahl und Betrag je Anteil haben
  // keine feste Nachkommastellenzahl, jede Vorgabe waere geraten.
  return null;
}

/**
 * Baut die Arbeitsmappe. Getrennt vom Blob, damit ein Test sie unmittelbar
 * pruefen kann, statt eine Datei wieder auseinandernehmen zu muessen.
 */
export async function buildXlsxWorkbook(
  payments: readonly ExportPayment[],
  columns: readonly ExportColumn[],
) {
  // Dynamischer Import: exceljs ist ~950 kB und wird nur beim XLSX-Export
  // gebraucht. Ein statischer Import zog die Bibliothek in den Haupt-Chunk und
  // machte die dynamischen Imports in den Workbook-Parsern wirkungslos
  // (Rolldown-Warnung INEFFECTIVE_DYNAMIC_IMPORT).
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Dividenden");
  const euroOnly = allEuro(payments);

  const headerRow = worksheet.addRow(columns.map((column) => column.label));
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  for (const payment of payments) {
    const row = worksheet.addRow(
      columns.map((column) =>
        xlsxCellValue(exportCellValue(payment, column.field), column.kind),
      ),
    );
    columns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      const format = numberFormat(column.kind, euroOnly);
      if (format) cell.numFmt = format;
      cell.alignment = {
        horizontal: column.kind === "text" ? "left" : "right",
      };
    });
  }

  // Spaltenbreiten an den laengsten Inhalt anpassen.
  worksheet.columns.forEach((column) => {
    let longest = 0;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      // `cell.value` kann ein Objekt sein (Formel, Rich Text); `text` liefert
      // dafuer die dargestellte Zeichenkette.
      const length = cell.text.length;
      if (length > longest) longest = length;
    });
    column.width = Math.min(longest + 2, 50);
  });

  // Kopfzeile beim Blaettern sichtbar halten.
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  return workbook;
}

// ============================================================================
// Datei ausliefern
// ============================================================================

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

/** Tagesstempel im Dateinamen: `dividenden-export-2026-07-31.csv`. */
function getTimestampSuffix(): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MIME: Record<ExportFormat, string> = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function executeExport(
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
): Promise<ExportResult> {
  try {
    const payments = await fetchPaymentsForExport(options, onProgress);

    if (payments.length === 0) {
      return {
        success: false,
        fileName: "",
        mimeType: "",
        error: "Es gibt keine Eingänge, die exportiert werden könnten.",
      };
    }

    onProgress?.({ stage: "generating", totalItems: payments.length });

    const columns = columnsFor(payments);
    const mimeType = MIME[options.format];
    const fileName = `dividenden-export-${getTimestampSuffix()}.${options.format}`;

    let blob: Blob;
    if (options.format === "xlsx") {
      const workbook = await buildXlsxWorkbook(payments, columns);
      blob = new Blob([await workbook.xlsx.writeBuffer()], { type: mimeType });
    } else {
      blob = new Blob([buildCsvDocument(payments, columns)], { type: mimeType });
    }

    downloadBlob(blob, fileName);
    return { success: true, fileName, mimeType };
  } catch (error) {
    return {
      success: false,
      fileName: "",
      mimeType: "",
      error: error instanceof Error ? error.message : "Der Export ist fehlgeschlagen.",
    };
  }
}
