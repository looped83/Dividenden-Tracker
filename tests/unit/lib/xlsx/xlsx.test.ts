// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { readXlsx } from "@/lib/xlsx/readXlsx";
import { writeXlsx, type XlsxSheetSpec } from "@/lib/xlsx/writeXlsx";

/**
 * Leser und Schreiber fuer .xlsx (DECISIONS.md ADR-007). Gelesen werden auch
 * von Hand gebaute Mappen, wie andere Programme sie schreiben: geteilte
 * Texte, Formeln, Datumsformate, das 1904-System, verborgene Blaetter.
 */

const MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const REL =
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function bytes(data: Uint8Array): ArrayBuffer {
  return new Uint8Array(data).buffer;
}

function mappe(files: Record<string, string>): ArrayBuffer {
  return bytes(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([path, xml]) => [path, strToU8(xml)]),
      ),
    ),
  );
}

/** Eine Mappe wie aus Excel: zwei Blaetter, eines verborgen. */
function excelMappe({ date1904 = false }: { date1904?: boolean } = {}): ArrayBuffer {
  return mappe({
    "xl/workbook.xml": `<workbook ${MAIN} ${REL}><workbookPr${date1904 ? ' date1904="1"' : ""}/><sheets><sheet name="Dividenden" sheetId="1" r:id="rId1"/><sheet name="Hilfe" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst ${MAIN}><si><t>Datum</t></si><si><t>Betrag</t></si><si><r><t>Alpha </t></r><r><t>AG</t></r></si></sst>`,
    "xl/styles.xml": `<styleSheet ${MAIN}><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00 &quot;€&quot;"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<worksheet ${MAIN}><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Name</t></is></c></row>
      <row r="2"><c r="A2" s="1"><v>46232</v></c><c r="B2" s="2"><v>12.5</v></c><c r="C2" t="s"><v>2</v></c></row>
      <row r="4"><c r="A4" s="3"><v>46233</v></c><c r="B4"><f>B2*2</f><v>25</v></c><c r="D4" t="b"><v>1</v></c></row>
      <row r="5"><c r="B5"><f>1/0</f></c><c r="C5" t="e"><v>#DIV/0!</v></c><c r="A5" t="str"><f>"x"</f><v>x</v></c><c r="D5"><f>A1</f><v/></c></row>
    </sheetData><mergeCells count="1"><mergeCell ref="A6:B6"/></mergeCells></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet ${MAIN}><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`,
  });
}

describe("readXlsx", () => {
  it("liest Blaetter mit Sichtbarkeit und verbundenen Zellen", () => {
    const { sheets, date1904 } = readXlsx(excelMappe());

    expect(date1904).toBe(false);
    expect(sheets.map((sheet) => [sheet.name, sheet.state])).toEqual([
      ["Dividenden", "visible"],
      ["Hilfe", "hidden"],
    ]);
    expect(sheets[0]?.hasMergedCells).toBe(true);
    expect(sheets[1]?.hasMergedCells).toBe(false);
  });

  it("liest Texte, Zahlen, Datumswerte und Formelergebnisse, Luecken als leer", () => {
    const sheet = readXlsx(excelMappe()).sheets.at(0);

    expect(sheet?.columnCount).toBe(4);
    expect(sheet?.rows).toEqual([
      ["Datum", "Betrag", "Name", null],
      [new Date("2026-07-29T00:00:00Z"), 12.5, "Alpha AG", null],
      [null, null, null, null],
      [new Date("2026-07-30T00:00:00Z"), 25, null, true],
      // Formel ohne Ergebnis (auch leeres `<v/>`) und Fehlerwert sind leer.
      ["x", null, null, null],
    ]);
  });

  it("rechnet im 1904-System vier Jahre und einen Tag weiter", () => {
    const sheet = readXlsx(excelMappe({ date1904: true })).sheets.at(0);
    expect(readXlsx(excelMappe({ date1904: true })).date1904).toBe(true);
    expect(sheet?.rows[1]?.[0]).toEqual(new Date("2030-07-30T00:00:00Z"));
  });

  it("lehnt eine Datei ab, die keine .xlsx ist", () => {
    expect(() => readXlsx(new TextEncoder().encode("kein zip").buffer)).toThrow(
      "Die Datei ist keine lesbare Excel-Datei.",
    );
  });
});

const SPEC: XlsxSheetSpec = {
  name: "Dividenden",
  columns: [
    { header: "Zahlungsdatum", numFmt: "dd.mm.yyyy", align: "right", width: 15 },
    { header: "Asset", align: "left", width: 20 },
    { header: "Nettobetrag", numFmt: '#,##0.00 "€"', align: "right", width: 14 },
  ],
  rows: [
    [new Date("2026-03-15T00:00:00Z"), "Müller & Söhne <AG>", 120],
    [new Date("2026-04-01T00:00:00Z"), '=HYPERLINK("x")', null],
  ],
};

describe("writeXlsx", () => {
  it("liest sich verlustfrei zurueck", () => {
    const { sheets } = readXlsx(bytes(writeXlsx(SPEC)));

    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.name).toBe("Dividenden");
    expect(sheets[0]?.rows).toEqual([
      ["Zahlungsdatum", "Asset", "Nettobetrag"],
      [new Date("2026-03-15T00:00:00Z"), "Müller & Söhne <AG>", 120],
      [new Date("2026-04-01T00:00:00Z"), '=HYPERLINK("x")', null],
    ]);
  });

  it("schreibt Texte nie als Formel, fixiert die Kopfzeile und setzt Formate", () => {
    const files = unzipSync(writeXlsx(SPEC));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    const styles = strFromU8(files["xl/styles.xml"]);

    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<col min="2" max="2" width="20" customWidth="1"/>');
    expect(styles).toContain('formatCode="dd.mm.yyyy"');
    expect(styles).toContain('formatCode="#,##0.00 &quot;€&quot;"');
  });

  it("entfernt Steuerzeichen, die XML nicht erlaubt", () => {
    const { sheets } = readXlsx(
      bytes(writeXlsx({ ...SPEC, rows: [[null, "A\u0001B", 1]] })),
    );
    expect(sheets[0]?.rows[1]?.[1]).toBe("AB");
  });
});
