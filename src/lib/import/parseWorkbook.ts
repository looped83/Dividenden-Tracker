import type ExcelJS from "exceljs";

/**
 * Excel-Analyse fuer den Import (IMPORT_SPEC.md §1, Task §1).
 *
 * Liefert je Arbeitsblatt Metadaten (Sichtbarkeit, Zeilen-/Spaltenzahl,
 * verbundene Zellen) und die Rohzellwerte. Formelzellen werden ueber ihren
 * berechneten Wert (`result`) gelesen, nie ueber den Formeltext. Das
 * Datumssystem der Arbeitsmappe (1900/1904) wird ausgelesen.
 *
 * Es wird `exceljs` genutzt (nicht SheetJS), da `cdn.sheetjs.com` in dieser
 * Umgebung nicht erreichbar ist und das npm-Paket `xlsx@0.18.5` mit bekannten
 * CVEs eingefroren ist (DECISIONS.md D-015, D-026). `exceljs` wird per
 * dynamischem Import nachgeladen (eigener Teil, rund 250 kB gepackt), damit es
 * nur beim Einlesen einer Datei geladen wird.
 */

export type ImportCellValue = string | number | boolean | Date | null;

export interface SheetInfo {
  name: string;
  /** exceljs-Sichtbarkeit: "visible" | "hidden" | "veryHidden". */
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

function cellToValue(value: ExcelJS.CellValue): ImportCellValue {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "text" in value) {
    const text = (value as { text: unknown }).text;
    return typeof text === "string" ? text : null;
  }
  if (typeof value === "object" && "result" in value) {
    // Formelzelle: berechneter Wert. Fehlerergebnisse (#DIV/0! etc.) sind Objekte
    // mit `error` -> als null behandeln, der Aufrufer markiert die Zeile.
    const result = (value as { result?: ExcelJS.CellValue; error?: string }).result;
    if (result === undefined) return null;
    return cellToValue(result);
  }
  if (typeof value === "object" && "error" in value) return null;
  if (typeof value === "object" && "hyperlink" in value) {
    const text = (value as { text?: string }).text;
    return typeof text === "string" ? text : null;
  }
  return null;
}

function hasMerges(worksheet: ExcelJS.Worksheet): boolean {
  // exceljs legt verbundene Bereiche intern ab; _merges ist nicht typisiert.
  const merges = (worksheet as unknown as { _merges?: Record<string, unknown> })._merges;
  return merges !== undefined && Object.keys(merges).length > 0;
}

/**
 * Geladene Arbeitsmappen je Datei. Der Import fragt dieselbe Datei mehrfach an
 * — erst die Blaetter (`analyzeWorkbook`), dann die Zellen (`readSheet`), bei
 * jedem Blattwechsel erneut. Jedes Mal zu entpacken und das XML zu lesen
 * kostete ein Vielfaches des eigentlichen Auslesens, im Hauptthread. Der
 * Schluessel ist der Puffer selbst: Solange der Import ihn haelt, bleibt die
 * Mappe geladen, danach raeumt sie der Garbage Collector mit ab.
 */
const loaded = new WeakMap<ArrayBuffer, Promise<ExcelJS.Workbook>>();

async function parseWorkbook(file: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const { default: ExcelJSModule } = await import("exceljs");
  const workbook = new ExcelJSModule.Workbook();
  await workbook.xlsx.load(file);
  return workbook;
}

function loadWorkbook(file: ArrayBuffer): Promise<ExcelJS.Workbook> {
  let workbook = loaded.get(file);
  if (!workbook) {
    workbook = parseWorkbook(file);
    loaded.set(file, workbook);
  }
  return workbook;
}

/** Analysiert Struktur/Metadaten aller Arbeitsblaetter, ohne alle Zellen zu materialisieren. */
export async function analyzeWorkbook(file: ArrayBuffer): Promise<WorkbookAnalysis> {
  const workbook = await loadWorkbook(file);
  const date1904 = Boolean(
    (workbook as unknown as { properties?: { date1904?: boolean } }).properties?.date1904,
  );
  const sheets: SheetInfo[] = workbook.worksheets.map((ws) => ({
    name: ws.name,
    state: ws.state,
    hidden: ws.state === "hidden" || ws.state === "veryHidden",
    rowCount: ws.rowCount,
    columnCount: ws.columnCount,
    hasMergedCells: hasMerges(ws),
  }));
  return { sheets, date1904 };
}

/** Liest die Rohzellwerte eines bestimmten Arbeitsblatts. */
export async function readSheet(
  file: ArrayBuffer,
  sheetName: string,
): Promise<SheetData> {
  const workbook = await loadWorkbook(file);
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    throw new Error(`Tabellenblatt "${sheetName}" wurde nicht gefunden.`);
  }

  const columnCount = worksheet.columnCount;
  const rows: ImportCellValue[][] = [];
  const allRows = worksheet.getRows(1, worksheet.rowCount) ?? [];
  for (const row of allRows) {
    const values = row.values as ExcelJS.CellValue[];
    // exceljs liefert `.values` 1-indiziert (Index 0 leer).
    const cells: ImportCellValue[] = [];
    for (let c = 1; c <= columnCount; c++) {
      cells.push(cellToValue(values[c]));
    }
    rows.push(cells);
  }

  return { name: sheetName, rows, hasMergedCells: hasMerges(worksheet) };
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
function toPlainValue(value: ExcelJS.CellValue): string | number | null {
  const cell = cellToValue(value);
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return typeof cell === "boolean" ? null : cell;
}

/**
 * Liest das erste Arbeitsblatt einer .xlsx-Datei als Kopfzeile und
 * Datenzeilen (IMPLEMENTATION_PLAN.md Phase 3 Zusatz: Unternehmens-Import).
 */
export async function parseFirstWorksheet(file: File): Promise<WorksheetTable> {
  const workbook = await loadWorkbook(await file.arrayBuffer());

  // `.worksheets[0]` ist laut exceljs-Typen nie `undefined` — bei einer leeren
  // Arbeitsmappe ist das zur Laufzeit dennoch moeglich, daher der explizite Cast.
  const worksheet = workbook.worksheets[0] as ExcelJS.Worksheet | undefined;
  if (!worksheet) {
    throw new Error("Die Datei enthält kein Arbeitsblatt.");
  }

  const allRows = worksheet.getRows(1, worksheet.rowCount) ?? [];
  const headerRow = allRows[0] as ExcelJS.Row | undefined;
  if (!headerRow) {
    throw new Error("Die Datei enthält keine Kopfzeile.");
  }

  // exceljs liefert `.values` 1-indiziert (Index 0 ist immer leer) — abschneiden.
  const headers = (headerRow.values as ExcelJS.CellValue[])
    .slice(1)
    .map((value) => (toPlainValue(value) ?? "").toString().trim());

  const rows = allRows.slice(1).map((row) => {
    const values = row.values as ExcelJS.CellValue[];
    return headers.map((_, index) => toPlainValue(values[index + 1]));
  });

  return { headers, rows };
}
