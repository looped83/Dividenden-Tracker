/**
 * Datenexport (CSV und Excel).
 *
 * Diese Datei prueft nicht mehr nur `escapeCsvField`, sondern die **fertige
 * Datei**: Welche Spalten sie hat und was in den Zellen steht. Genau das fehlte
 * — der Excel-Zweig las seine Werte ueber `payment[feld]`, kannte damit die
 * verbundenen Tabellen nicht, und Unternehmen, Ticker und Depot blieben in
 * jeder XLSX-Datei leer. Kein Test hat das bemerkt, weil keiner je eine Zeile
 * erzeugt hat.
 */

import { describe, it, expect } from "vitest";
import {
  buildCsvDocument,
  buildXlsxSheet,
  columnsFor,
  escapeCsvField,
  exportCellValue,
  type ExportPayment,
} from "@/lib/backup/exportService";

/** Zerlegt eine CSV-Zeile RFC-4180-konform in Felder. */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/** Die Zeilen einer CSV-Datei ohne BOM und ohne die leere Schlusszeile. */
function csvRows(document: string): string[][] {
  return document
    .replace(/^\uFEFF/, "")
    .split("\r\n")
    .filter((line) => line !== "")
    .map(parseCsvRow);
}

function zahlung(overrides: Partial<ExportPayment> = {}): ExportPayment {
  return {
    pay_date: "2026-03-15",
    gross_amount: "120.00",
    net_amount: "120.00",
    withholding_tax: "0",
    domestic_tax: "0",
    solidarity_surcharge: "0",
    church_tax: "0",
    fees: "0",
    quantity: null,
    amount_per_share: null,
    payment_type: "regular",
    original_currency: "EUR",
    note: null,
    archived_at: null,
    security: { name: "Alpha AG", ticker: "ALP" },
    depot: { name: "Hauptdepot" },
    ...overrides,
  };
}

describe("Export — Zellwerte", () => {
  it("loest die verbundenen Tabellen auf", () => {
    const payment = zahlung();
    expect(exportCellValue(payment, "security_name")).toBe("Alpha AG");
    expect(exportCellValue(payment, "ticker")).toBe("ALP");
    expect(exportCellValue(payment, "depot_name")).toBe("Hauptdepot");
  });

  it("nennt die Zahlungsart auf Deutsch und den Storno als Ja", () => {
    expect(exportCellValue(zahlung({ payment_type: "special" }), "payment_type")).toBe(
      "Sonderdividende",
    );
    expect(
      exportCellValue(zahlung({ archived_at: "2026-04-01T10:00:00Z" }), "archived_at"),
    ).toBe("ja");
    expect(exportCellValue(zahlung(), "archived_at")).toBeNull();
  });
});

describe("Export — Spaltenwahl", () => {
  it("laesst leere und durchgaengig leere Spalten weg", () => {
    const labels = columnsFor([zahlung()]).map((column) => column.label);
    expect(labels).toEqual([
      "Zahlungsdatum",
      "Asset",
      "Ticker",
      "Depot",
      "Bruttobetrag",
      "Nettobetrag",
    ]);
    // Steuern und Gebuehren stehen auf 0, Menge und Notiz sind leer: Spalten
    // aus lauter Nullen sagen dasselbe wie keine Spalte.
    expect(labels).not.toContain("Quellensteuer");
    expect(labels).not.toContain("Menge");
    expect(labels).not.toContain("Notiz");
    // Nichts ist storniert, alles regulaer, alles in Euro.
    expect(labels).not.toContain("Storniert");
    expect(labels).not.toContain("Zahlungsart");
    expect(labels).not.toContain("Währung");
  });

  it("nimmt eine Spalte auf, sobald ein einziger Eingang etwas darin stehen hat", () => {
    const labels = columnsFor([
      zahlung(),
      zahlung({ withholding_tax: "18.50", note: "Quartalsdividende" }),
    ]).map((column) => column.label);
    expect(labels).toContain("Quellensteuer");
    expect(labels).toContain("Notiz");
  });

  it("weist stornierte Eingaenge aus, statt sie unerkennbar mitzufuehren", () => {
    const labels = columnsFor([
      zahlung(),
      zahlung({ archived_at: "2026-04-01T10:00:00Z" }),
    ]).map((column) => column.label);
    expect(labels).toContain("Storniert");
  });

  it("nennt die Waehrung nur, wenn nicht alles in Euro steht", () => {
    expect(columnsFor([zahlung()]).map((c) => c.label)).not.toContain("Währung");
    expect(
      columnsFor([zahlung(), zahlung({ original_currency: "USD" })]).map((c) => c.label),
    ).toContain("Währung");
  });
});

describe("Export — CSV", () => {
  it("schreibt Kopfzeile und Werte in derselben Reihenfolge", () => {
    const payments = [zahlung()];
    const rows = csvRows(buildCsvDocument(payments, columnsFor(payments)));
    expect(rows[0]).toEqual([
      "Zahlungsdatum",
      "Asset",
      "Ticker",
      "Depot",
      "Bruttobetrag",
      "Nettobetrag",
    ]);
    expect(rows[1]).toEqual([
      "2026-03-15",
      "Alpha AG",
      "ALP",
      "Hauptdepot",
      "120.00",
      "120.00",
    ]);
  });

  it("beginnt mit einem BOM und trennt Zeilen mit CRLF", () => {
    // Ohne BOM liest Excel unter Windows in der Systemcodepage: Aus „Müller AG"
    // wird „MÃ¼ller AG".
    const payments = [zahlung({ security: { name: "Müller AG", ticker: null } })];
    const document = buildCsvDocument(payments, columnsFor(payments));
    expect(document.startsWith("\uFEFF")).toBe(true);
    expect(document).toContain("\r\n");
    expect(document).toContain("Müller AG");
  });

  it("haelt einen Namen mit Komma in seiner Spalte", () => {
    const payments = [zahlung({ security: { name: "Alpha, Inc.", ticker: null } })];
    const rows = csvRows(buildCsvDocument(payments, columnsFor(payments)));
    expect(rows[1]?.[1]).toBe("Alpha, Inc.");
    expect(rows[1]).toHaveLength(rows[0]?.length ?? 0);
  });
});

/** Zellwert wie in Excel adressiert: Zeile 1 ist die Kopfzeile, Spalten ab 1. */
function zelle(sheet: ReturnType<typeof buildXlsxSheet>, row: number, column: number) {
  return row === 1
    ? sheet.columns[column - 1]?.header
    : sheet.rows[row - 2]?.[column - 1];
}

describe("Export — Excel", () => {
  it("fuellt Asset, Ticker und Depot — genau das fehlte", () => {
    const payments = [zahlung()];
    const sheet = buildXlsxSheet(payments, columnsFor(payments));

    expect(zelle(sheet, 1, 2)).toBe("Asset");
    expect(zelle(sheet, 2, 2)).toBe("Alpha AG");
    expect(zelle(sheet, 2, 3)).toBe("ALP");
    expect(zelle(sheet, 2, 4)).toBe("Hauptdepot");
  });

  it("schreibt Betraege als Zahl und das Datum als Datum", () => {
    const payments = [zahlung({ fees: "1.25", quantity: "10.5" })];
    const columns = columnsFor(payments);
    const sheet = buildXlsxSheet(payments, columns);
    const index = (label: string) =>
      columns.findIndex((column) => column.label === label) + 1;

    expect(zelle(sheet, 2, index("Nettobetrag"))).toBe(120);
    // Gebuehren und Menge fielen frueher durch die Namenspruefung und standen
    // als Text in der Datei.
    expect(zelle(sheet, 2, index("Gebühren"))).toBe(1.25);
    expect(zelle(sheet, 2, index("Menge"))).toBe(10.5);

    const datum = zelle(sheet, 2, index("Zahlungsdatum"));
    expect(datum).toBeInstanceOf(Date);
    expect((datum as Date).toISOString()).toBe("2026-03-15T00:00:00.000Z");
    expect(sheet.columns[index("Zahlungsdatum") - 1]?.numFmt).toBe("dd.mm.yyyy");
  });

  it("haengt das Eurozeichen nur an, wenn alles in Euro steht", () => {
    const euro = [zahlung()];
    const gemischt = [zahlung(), zahlung({ original_currency: "USD" })];

    expect(buildXlsxSheet(euro, columnsFor(euro)).columns[5]?.numFmt).toBe(
      '#,##0.00 "€"',
    );

    const spalten = columnsFor(gemischt);
    const netto = spalten.findIndex((column) => column.label === "Nettobetrag");
    expect(buildXlsxSheet(gemischt, spalten).columns[netto]?.numFmt).toBe("#,##0.00");
  });

  it("uebernimmt einen unlesbaren Betrag als Text, statt still 0 zu schreiben", () => {
    const payments = [zahlung({ net_amount: "12,34 EUR" })];
    const columns = columnsFor(payments);
    const sheet = buildXlsxSheet(payments, columns);
    const netto = columns.findIndex((column) => column.label === "Nettobetrag") + 1;
    expect(zelle(sheet, 2, netto)).toBe("12,34 EUR");
  });

  it("schreibt eine Zeile je Eingang", () => {
    const payments = [zahlung(), zahlung(), zahlung()];
    expect(buildXlsxSheet(payments, columnsFor(payments)).rows).toHaveLength(3);
  });

  it("richtet die Spaltenbreite am laengsten Inhalt aus, hoechstens 50 Zeichen", () => {
    const payments = [zahlung({ security: { name: "A".repeat(80), ticker: "ALP" } })];
    const columns = columnsFor(payments);
    const sheet = buildXlsxSheet(payments, columns);
    const index = (label: string) =>
      columns.findIndex((column) => column.label === label);

    expect(sheet.columns[index("Asset")]?.width).toBe(50);
    // Das Datum zeigt Excel zehnstellig; die Kopfzeile ist laenger.
    expect(sheet.columns[index("Zahlungsdatum")]?.width).toBe("Zahlungsdatum".length + 2);
  });
});

describe("Export — Schutz vor Formeln in CSV", () => {
  it("neutralisiert Formeln mit vorangestelltem Apostroph", () => {
    for (const attack of ["=1+1", "+1+1", "@SUM(A1)", "-2*3", "\t=1+1"]) {
      const [field] = parseCsvRow(escapeCsvField(attack));
      expect(field).toBe(`'${attack}`);
    }
  });

  it("maskiert Quotes auch im Formel-Zweig (Ausbruch aus dem Feld)", () => {
    // Zuvor: `"'=x","y"` — das Feld endete nach `=x` und `y` wurde zu einer
    // eigenen Spalte. Ein Angreifer konnte so beliebige Spalten einschleusen.
    expect(parseCsvRow(escapeCsvField('=x","y'))).toEqual(['\'=x","y']);
  });

  it("haelt eine Zeile auch bei Formel und Komma einspaltig", () => {
    expect(parseCsvRow(escapeCsvField("=SUM(A1,B1)"))).toHaveLength(1);
  });

  it("exportiert negative Betraege als Zahl, nicht als Text", () => {
    // `-12.34` beginnt mit `-`, ist aber ein reines Zahlenliteral und damit
    // keine Formel. Der frueher vorangestellte Apostroph machte jeden
    // Storno-/Korrekturbetrag in Excel zu nicht rechenbarem Text.
    for (const amount of ["-12.34", "-1", "12.34", "0.00"]) {
      expect(escapeCsvField(amount)).toBe(amount);
    }
  });

  it("schuetzt weiterhin Werte, die nur wie Zahlen beginnen", () => {
    for (const attack of ["-2*3", "-1+1", "+1e1*2"]) {
      expect(escapeCsvField(attack)).toContain("'");
    }
  });

  it("maskiert Wagenrueckläufe, die eine Zeile spalten wuerden", () => {
    expect(parseCsvRow(escapeCsvField("a\r\nb"))).toEqual(["a\r\nb"]);
  });

  it("maskiert Quotes, Kommata und Zeilenumbrueche", () => {
    expect(escapeCsvField('Test "quoted" value')).toContain('""');
    expect(escapeCsvField("Value, with, commas")).toMatch(/^".*"$/);
    expect(escapeCsvField("Line1\nLine2")).toMatch(/^".*"$/s);
  });

  it("laesst gewoehnliche und leere Werte unveraendert", () => {
    expect(escapeCsvField("Normal Value")).toBe("Normal Value");
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
    expect(escapeCsvField(123.45)).toBe("123.45");
  });
});
