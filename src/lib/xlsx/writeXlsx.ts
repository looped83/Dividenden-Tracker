import { strToU8, zipSync } from "fflate";

/**
 * Schlanker Schreiber fuer eine .xlsx-Datei mit einem Blatt (Datenexport).
 *
 * Kann genau, was der Export braucht: eine fett hinterlegte Kopfzeile, die
 * beim Blaettern stehen bleibt, Text, Zahlen und Datumswerte mit Zahlenformat
 * und Ausrichtung je Spalte sowie Spaltenbreiten. Texte stehen als
 * Inline-Strings in der Zelle — Excel wertet sie nie als Formel aus. Ersetzt
 * `exceljs` (DECISIONS.md ADR-007).
 */

export type XlsxWriteValue = string | number | Date | null;

export interface XlsxColumn {
  header: string;
  /** Zahlenformat (`dd.mm.yyyy`, `#,##0.00 "€"` …); ohne Angabe Standard. */
  numFmt?: string | undefined;
  align: "left" | "right";
  /** Breite in Zeichen. */
  width: number;
}

export interface XlsxSheetSpec {
  name: string;
  columns: readonly XlsxColumn[];
  rows: readonly (readonly XlsxWriteValue[])[];
}

const MS_PER_DAY = 86_400_000;
const EPOCH_1900 = Date.UTC(1899, 11, 30);
/** Erste Kennung fuer eigene Zahlenformate (0–163 sind eingebaut). */
const FIRST_CUSTOM_FORMAT = 164;

// Steuerzeichen ausser Tab, Zeilenvorschub und Wagenruecklauf sind in XML 1.0
// nicht erlaubt; Excel verweigert sonst die ganze Datei.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Spalte 28 → „AB". */
function columnName(index: number): string {
  let name = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function dateToSerial(date: Date): number {
  return (date.getTime() - EPOCH_1900) / MS_PER_DAY;
}

/**
 * Stile: 0 Standard, 1 Kopfzeile, ab 2 je Spalte einer. Gleiche Spalten
 * teilen sich keinen Eintrag — bei einer Handvoll Spalten lohnt das nicht.
 */
function stylesXml(columns: readonly XlsxColumn[]): string {
  const formats = [...new Set(columns.flatMap((column) => column.numFmt ?? []))];
  const formatId = (code: string | undefined) =>
    code === undefined ? 0 : FIRST_CUSTOM_FORMAT + formats.indexOf(code);

  const numFmts = formats
    .map(
      (code, index) =>
        `<numFmt numFmtId="${String(FIRST_CUSTOM_FORMAT + index)}" formatCode="${escapeXml(code)}"/>`,
    )
    .join("");
  const columnXfs = columns
    .map((column) => {
      const id = formatId(column.numFmt);
      return `<xf numFmtId="${String(id)}" fontId="0" fillId="0" borderId="0" xfId="0"${id ? ' applyNumberFormat="1"' : ""} applyAlignment="1"><alignment horizontal="${column.align}"/></xf>`;
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    formats.length
      ? `<numFmts count="${String(formats.length)}">${numFmts}</numFmts>`
      : "",
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>',
    '<fills count="3"><fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill></fills>',
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    `<cellXfs count="${String(columns.length + 2)}">`,
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    columnXfs,
    "</cellXfs>",
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    "</styleSheet>",
  ].join("");
}

function cellXml(reference: string, value: XlsxWriteValue, style: number): string {
  const s = style ? ` s="${String(style)}"` : "";
  if (value === null || value === "") return "";
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? `<c r="${reference}"${s}><v>${String(value)}</v></c>`
      : "";
  }
  if (value instanceof Date) {
    return `<c r="${reference}"${s}><v>${String(dateToSerial(value))}</v></c>`;
  }
  return `<c r="${reference}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml({ columns, rows }: XlsxSheetSpec): string {
  const lastColumn = columnName(Math.max(columns.length, 1));
  const header = columns
    .map((column, index) => cellXml(`${columnName(index + 1)}1`, column.header, 1))
    .join("");
  const body = rows
    .map((row, rowIndex) => {
      const r = String(rowIndex + 2);
      const cells = columns
        .map((_, index) =>
          cellXml(`${columnName(index + 1)}${r}`, row[index] ?? null, index + 2),
        )
        .join("");
      return `<row r="${r}">${cells}</row>`;
    })
    .join("");
  const cols = columns
    .map(
      (column, index) =>
        `<col min="${String(index + 1)}" max="${String(index + 1)}" width="${String(column.width)}" customWidth="1"/>`,
    )
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<dimension ref="A1:${lastColumn}${String(rows.length + 1)}"/>`,
    // Kopfzeile beim Blaettern sichtbar halten.
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
    '<sheetFormatPr defaultRowHeight="15"/>',
    cols ? `<cols>${cols}</cols>` : "",
    `<sheetData><row r="1">${header}</row>${body}</sheetData>`,
    "</worksheet>",
  ].join("");
}

/** Die fertige Datei als Bytes. */
export function writeXlsx(sheet: XlsxSheetSpec): Uint8Array<ArrayBuffer> {
  const name = escapeXml(sheet.name.slice(0, 31));
  const files: Record<string, string> = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      "</Types>",
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>",
    "xl/workbook.xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
      "</workbook>",
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>",
    "xl/styles.xml": stylesXml(sheet.columns),
    "xl/worksheets/sheet1.xml": sheetXml(sheet),
  };

  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([path, xml]) => [path, strToU8(xml)])),
  );
  // Eine Kopie mit eigenem ArrayBuffer: Erst so nimmt `Blob` die Bytes laut
  // Typen an (fflate ist auf `ArrayBufferLike` typisiert).
  return new Uint8Array(zipped);
}
