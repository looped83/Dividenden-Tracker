import type { XlsxWorkbook } from "@/lib/xlsx/readXlsx";

/**
 * Excel-Analyse fuer den Import (IMPORT_SPEC.md §1, Task §1).
 *
 * Liefert je Arbeitsblatt Metadaten (Sichtbarkeit, Zeilen-/Spaltenzahl,
 * verbundene Zellen) und die Rohzellwerte. Formelzellen werden ueber ihren
 * berechneten Wert gelesen, nie ueber den Formeltext. Das Datumssystem der
 * Arbeitsmappe (1900/1904) wird ausgelesen.
 *
 * Gelesen wird mit dem eigenen, schlanken Leser `lib/xlsx/readXlsx.ts`
 * (DECISIONS.md ADR-007). Er wird per dynamischem Import nachgeladen, damit
 * er nur beim Einlesen einer Datei geladen wird.
 */

export type ImportCellValue = string | number | boolean | Date | null;

export interface SheetInfo {
  name: string;
  /** Sichtbarkeit: "visible" | "hidden" | "veryHidden". */
  state: string;
  hidden: boolean;
  rowCount: number;
  columnCount: number;
  /** true, wenn das Blatt verbundene Zellen enthaelt (als problematisch markiert). */
  hasMergedCells: boolean;
}

export interface WorkbookAnalysis {
  sheets: SheetInfo[];
  date1904: boolean;
}

export interface SheetData {
  name: string;
  rows: ImportCellValue[][];
  hasMergedCells: boolean;
}

/**
 * Geladene Arbeitsmappen je Datei. Der Import fragt dieselbe Datei mehrfach an
 * — erst die Blaetter (`analyzeWorkbook`), dann die Zellen (`readSheet`), bei
 * jedem Blattwechsel erneut. Jedes Mal zu entpacken und das XML zu lesen
 * kostete ein Vielfaches des eigentlichen Auslesens, im Hauptthread. Der
 * Schluessel ist der Puffer selbst: Solange der Import ihn haelt, bleibt die
 * Mappe geladen, danach raeumt sie der Garbage Collector mit ab.
 */
const loaded = new WeakMap<ArrayBuffer, Promise<XlsxWorkbook>>();

async function parseWorkbook(file: ArrayBuffer): Promise<XlsxWorkbook> {
  const { readXlsx } = await import("@/lib/xlsx/readXlsx");
  return readXlsx(file);
}

function loadWorkbook(file: ArrayBuffer): Promise<XlsxWorkbook> {
  let workbook = loaded.get(file);
  if (!workbook) {
    workbook = parseWorkbook(file);
    loaded.set(file, workbook);
  }
  return workbook;
}

/** Analysiert Struktur/Metadaten aller Arbeitsblaetter. */
export async function analyzeWorkbook(file: ArrayBuffer): Promise<WorkbookAnalysis> {
  const workbook = await loadWorkbook(file);
  const sheets: SheetInfo[] = workbook.sheets.map((sheet) => ({
    name: sheet.name,
    state: sheet.state,
    hidden: sheet.state === "hidden" || sheet.state === "veryHidden",
    rowCount: sheet.rows.length,
    columnCount: sheet.columnCount,
    hasMergedCells: sheet.hasMergedCells,
  }));
  return { sheets, date1904: workbook.date1904 };
}

/** Liest die Rohzellwerte eines bestimmten Arbeitsblatts. */
export async function readSheet(
  file: ArrayBuffer,
  sheetName: string,
): Promise<SheetData> {
  const workbook = await loadWorkbook(file);
  const sheet = workbook.sheets.find((candidate) => candidate.name === sheetName);
  if (!sheet) {
    throw new Error(`Tabellenblatt "${sheetName}" wurde nicht gefunden.`);
  }
  return { name: sheetName, rows: sheet.rows, hasMergedCells: sheet.hasMergedCells };
}

/** Kopfzeile und Datenzeilen des ersten Blatts (Unternehmens-Import). */
export interface WorksheetTable {
  headers: string[];
  rows: (string | number | null)[][];
}

/**
 * Zellwert fuer {@link WorksheetTable}: Datumszellen als Kalendertag
 * („2026-07-29"), Wahrheitswerte zaehlen nicht.
 */
function toPlainValue(cell: ImportCellValue | undefined): string | number | null {
  if (cell === undefined) return null;
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return typeof cell === "boolean" ? null : cell;
}

/**
 * Liest das erste Arbeitsblatt einer .xlsx-Datei als Kopfzeile und
 * Datenzeilen (IMPLEMENTATION_PLAN.md Phase 3 Zusatz: Unternehmens-Import).
 */
export async function parseFirstWorksheet(file: File): Promise<WorksheetTable> {
  const workbook = await loadWorkbook(await file.arrayBuffer());

  const sheet = workbook.sheets.at(0);
  if (!sheet) {
    throw new Error("Die Datei enthält kein Arbeitsblatt.");
  }

  const headerRow = sheet.rows.at(0);
  const dataRows = sheet.rows.slice(1);
  if (!headerRow) {
    throw new Error("Die Datei enthält keine Kopfzeile.");
  }

  // Die Kopfzeile endet mit ihrer letzten belegten Zelle.
  let width = headerRow.length;
  while (width > 0 && headerRow[width - 1] === null) width -= 1;
  const headers = headerRow
    .slice(0, width)
    .map((value) => (toPlainValue(value) ?? "").toString().trim());

  const rows = dataRows.map((row) => headers.map((_, index) => toPlainValue(row[index])));

  return { headers, rows };
}
