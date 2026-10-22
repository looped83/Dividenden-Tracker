import { strFromU8, unzipSync } from "fflate";

/**
 * Schlanker Leser fuer .xlsx-Dateien (Office Open XML).
 *
 * Gelesen wird genau das, was der Import braucht: Blaetter mit Namen und
 * Sichtbarkeit, das Datumssystem, verbundene Zellen und die Zellwerte —
 * Formelzellen ueber ihr zuletzt berechnetes Ergebnis, nie ueber den
 * Formeltext. Formatierungen ausser der Frage „ist das ein Datum?" interessieren
 * nicht. Ersetzt `exceljs` (rund 250 kB gepackt, DECISIONS.md ADR-007); hier
 * kommen nur `fflate` zum Entpacken und der `DOMParser` des Browsers zum Einsatz.
 */

export type XlsxCellValue = string | number | boolean | Date | null;

export interface XlsxSheet {
  name: string;
  /** "visible" | "hidden" | "veryHidden" (Attribut `state` in workbook.xml). */
  state: string;
  /** Zeilen ab Zeile 1, dicht: fehlende Zellen und Zeilen sind `null` bzw. leer. */
  rows: XlsxCellValue[][];
  /** Hoechste belegte Spaltennummer (1-basiert). */
  columnCount: number;
  hasMergedCells: boolean;
}

export interface XlsxWorkbook {
  date1904: boolean;
  sheets: XlsxSheet[];
}

const MS_PER_DAY = 86_400_000;
// 1899-12-30: gleicht den Schaltjahr-Fehler des 1900-Systems aus (excelDate.ts).
const EPOCH_1900 = Date.UTC(1899, 11, 30);
const EPOCH_1904 = Date.UTC(1904, 0, 1);

/** Eingebaute Zahlenformate, die ein Datum oder eine Uhrzeit darstellen. */
const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47,
  50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Die Datei ist keine lesbare Excel-Datei.");
  }
  return doc;
}

/**
 * Elemente nach lokalem Namen, unabhaengig von Praefix und Namensraum: `c`
 * wie `x:c`, Transitional wie Strict OOXML.
 */
function elements(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", name));
}

/** Verweis eines Blatts auf seine Datei (`r:id`, Praefix frei gewaehlt). */
function relationId(sheet: Element): string {
  for (const attribute of Array.from(sheet.attributes)) {
    if (attribute.localName === "id" && attribute.namespaceURI) return attribute.value;
  }
  return "";
}

function children(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === name);
}

/** Text eines Rich-Text-Eintrags: alle `t` ausser der Lautschrift (`rPh`). */
function richText(element: Element): string {
  return elements(element, "t")
    .filter((t) => (t.parentElement as Element | null)?.localName !== "rPh")
    .map((t) => t.textContent)
    .join("");
}

/**
 * Ein eigenes Zahlenformat zeigt ein Datum, wenn es ausserhalb von
 * Anfuehrungszeichen, Escapes und eckigen Klammern (Farben, Bedingungen) Tag,
 * Monat, Jahr oder Uhrzeit enthaelt.
 */
function isDateFormatCode(code: string): boolean {
  const stripped = code
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "");
  return /[dmyhs]/i.test(stripped) && !/^general$/i.test(stripped.trim());
}

/** Je Zellstil (`s`-Index), ob er ein Datum formatiert. */
function readDateStyles(doc: Document | null): boolean[] {
  if (!doc) return [];
  const custom = new Map<number, string>();
  for (const format of elements(doc, "numFmt")) {
    custom.set(
      Number.parseInt(format.getAttribute("numFmtId") ?? "", 10),
      format.getAttribute("formatCode") ?? "",
    );
  }
  const cellXfs = elements(doc, "cellXfs").at(0);
  if (!cellXfs) return [];
  return children(cellXfs, "xf").map((xf) => {
    const id = Number.parseInt(xf.getAttribute("numFmtId") ?? "0", 10);
    const code = custom.get(id);
    return code === undefined ? BUILTIN_DATE_FORMATS.has(id) : isDateFormatCode(code);
  });
}

/** „AB12" → Spalte 28 (1-basiert); `null` ohne Bezug. */
function columnOf(reference: string | null): number | null {
  if (!reference) return null;
  let column = 0;
  for (const char of reference) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) break;
    column = column * 26 + (code - 64);
  }
  return column > 0 ? column : null;
}

function serialToDate(serial: number, date1904: boolean): Date {
  return new Date((date1904 ? EPOCH_1904 : EPOCH_1900) + Math.round(serial * MS_PER_DAY));
}

interface CellContext {
  sharedStrings: string[];
  dateStyles: boolean[];
  date1904: boolean;
}

function cellValue(cell: Element, context: CellContext): XlsxCellValue {
  const type = cell.getAttribute("t") ?? "n";
  if (type === "inlineStr") {
    const inline = children(cell, "is").at(0);
    return inline ? richText(inline) : null;
  }

  const raw = children(cell, "v").at(0)?.textContent ?? null;
  // Formel ohne gespeichertes Ergebnis (manche Programme schreiben ein leeres
  // `<v/>`) oder leere Zelle.
  if (raw === null || raw === "") return null;

  switch (type) {
    case "s":
      return context.sharedStrings.at(Number.parseInt(raw, 10)) ?? null;
    case "str":
      return raw;
    case "b":
      return raw === "1";
    // Fehlerwerte (#DIV/0! …) gelten als leer; der Import markiert die Zeile.
    case "e":
      return null;
    case "d": {
      const date = new Date(raw);
      return Number.isNaN(date.getTime()) ? raw : date;
    }
    default: {
      const number = Number.parseFloat(raw);
      if (!Number.isFinite(number)) return null;
      const style = Number.parseInt(cell.getAttribute("s") ?? "0", 10);
      return context.dateStyles.at(style)
        ? serialToDate(number, context.date1904)
        : number;
    }
  }
}

function readSheetXml(
  doc: Document,
  context: CellContext,
): Omit<XlsxSheet, "name" | "state"> {
  const rows: XlsxCellValue[][] = [];
  let columnCount = 0;
  let nextRow = 1;

  for (const row of elements(doc, "row")) {
    const rowNumber = Number.parseInt(row.getAttribute("r") ?? String(nextRow), 10);
    nextRow = rowNumber + 1;
    const cells: XlsxCellValue[] = [];
    let nextColumn = 1;
    for (const cell of children(row, "c")) {
      const column = columnOf(cell.getAttribute("r")) ?? nextColumn;
      nextColumn = column + 1;
      const value = cellValue(cell, context);
      if (value === null || value === "") continue;
      while (cells.length < column - 1) cells.push(null);
      cells[column - 1] = value;
    }
    if (cells.length === 0) continue;
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
    columnCount = Math.max(columnCount, cells.length);
  }

  // Dicht machen: jede Zeile gleich breit, wie es der Import erwartet.
  for (const row of rows) {
    while (row.length < columnCount) row.push(null);
  }

  return {
    rows,
    columnCount,
    hasMergedCells: elements(doc, "mergeCell").length > 0,
  };
}

/** Pfad eines Teils relativ zu `xl/` aufloesen („worksheets/sheet1.xml", „/xl/…"). */
function resolvePart(target: string): string {
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

export function readXlsx(buffer: ArrayBuffer): XlsxWorkbook {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error("Die Datei ist keine lesbare Excel-Datei.");
  }
  const part = (path: string): Document | null => {
    const file = files[path] as Uint8Array | undefined;
    return file ? parseXml(strFromU8(file)) : null;
  };

  const workbook = part("xl/workbook.xml");
  if (!workbook) throw new Error("Die Datei ist keine lesbare Excel-Datei.");

  const workbookPr = elements(workbook, "workbookPr").at(0);
  const date1904Attr = workbookPr?.getAttribute("date1904");
  const date1904 = date1904Attr === "1" || date1904Attr === "true";

  const targets = new Map<string, string>();
  const rels = part("xl/_rels/workbook.xml.rels");
  for (const rel of rels ? elements(rels, "Relationship") : []) {
    targets.set(rel.getAttribute("Id") ?? "", rel.getAttribute("Target") ?? "");
  }

  const sharedDoc = part("xl/sharedStrings.xml");
  const context: CellContext = {
    sharedStrings: sharedDoc ? elements(sharedDoc, "si").map(richText) : [],
    dateStyles: readDateStyles(part("xl/styles.xml")),
    date1904,
  };

  const sheets: XlsxSheet[] = [];
  for (const sheet of elements(workbook, "sheet")) {
    const target = targets.get(relationId(sheet));
    // Diagrammblaetter u. ae. tragen keine Zellen.
    if (!target?.includes("worksheets/")) continue;
    const doc = part(resolvePart(target));
    if (!doc) continue;
    sheets.push({
      name: sheet.getAttribute("name") ?? "",
      state: sheet.getAttribute("state") ?? "visible",
      ...readSheetXml(doc, context),
    });
  }

  return { date1904, sheets };
}
