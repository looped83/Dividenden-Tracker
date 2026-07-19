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
 * CVEs eingefroren ist (DECISIONS.md D-015, D-026).
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

async function loadWorkbook(file: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const { default: ExcelJSModule } = await import("exceljs");
  const workbook = new ExcelJSModule.Workbook();
  await workbook.xlsx.load(file);
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
