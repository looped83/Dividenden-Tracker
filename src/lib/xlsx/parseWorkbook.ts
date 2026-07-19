import type ExcelJS from "exceljs";

export interface WorksheetTable {
  headers: string[];
  rows: (string | number | null)[][];
}

function cellToPlainValue(value: ExcelJS.CellValue): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "text" in value) {
    // Rich-Text-Zelle (mehrere Formatierungen in einer Zelle).
    const text = (value as { text: unknown }).text;
    return typeof text === "string" ? text : null;
  }
  if (typeof value === "object" && "result" in value) {
    // Formelzelle: berechneter Wert statt Formeltext.
    return cellToPlainValue((value as { result: ExcelJS.CellValue }).result);
  }
  return null;
}

/**
 * Liest das erste Arbeitsblatt einer .xlsx-Datei als einfache Kopfzeile +
 * Datenzeilen ein (IMPLEMENTATION_PLAN.md Phase 3 Zusatz: Unternehmens-Import).
 * Nutzt `exceljs` statt SheetJS/`xlsx`, da `cdn.sheetjs.com` in dieser
 * Implementierungsumgebung nicht erreichbar ist (DECISIONS.md D-026) und das
 * npm-Paket `xlsx` bei 0.18.5 mit bekannten CVEs eingefroren ist (D-015).
 * `exceljs` wird per dynamischem Import nachgeladen (eigener Chunk), damit
 * das ~500 KB grosse Paket nicht das Hauptbundle jeder Seite aufblaeht,
 * obwohl es nur beim Excel-Import der Unternehmensseite gebraucht wird.
 */
export async function parseFirstWorksheet(file: File): Promise<WorksheetTable> {
  const { default: ExcelJSModule } = await import("exceljs");
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJSModule.Workbook();
  await workbook.xlsx.load(buffer);

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
  const dataRows = allRows.slice(1);

  const headers = headerRow.values as ExcelJS.CellValue[];
  // exceljs liefert `.values` 1-indiziert (Index 0 ist immer leer) — abschneiden.
  const headerStrings = headers
    .slice(1)
    .map((value) => (cellToPlainValue(value) ?? "").toString().trim());

  const rows = dataRows.map((row) => {
    const values = row.values as ExcelJS.CellValue[];
    return headerStrings.map((_, index) => cellToPlainValue(values[index + 1]));
  });

  return { headers: headerStrings, rows };
}
