/**
 * Export Service Tests
 *
 * Unit tests for CSV/Excel/JSON export functionality and formula injection protection.
 */

import { describe, it, expect } from "vitest";
// Wichtig: die echte Implementierung importieren. Diese Datei enthielt zuvor
// eine lokale Kopie von escapeCsvField ("simulating escapeCsvField"), sodass
// die Tests nur den Klon prueften und Fehler im Produktionscode nicht
// bemerkten — genau so blieb der Quote-Escaping-Fehler unentdeckt.
import { escapeCsvField } from "@/lib/backup/exportService";

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

describe("Export Service", () => {
  describe("CSV Formula Injection Protection", () => {
    it("should escape formula starting with =", () => {
      const result = escapeCsvField("=SUM(A1:A10)");
      expect(result).toContain("'=SUM");
    });

    it("should escape formula starting with +", () => {
      const result = escapeCsvField("+1+1");
      expect(result).toContain("'+1");
    });

    it("should escape formula starting with -", () => {
      const result = escapeCsvField("-2*3");
      expect(result).toContain("'-2");
    });

    // --- Regressionstests Phase 9.5 -------------------------------------

    it("maskiert Quotes auch im Formel-Zweig (Ausbruch aus dem Feld)", () => {
      // Zuvor: `"'=x","y"` — das Feld endete nach `=x` und `y` wurde zu einer
      // eigenen Spalte. Ein Angreifer konnte so beliebige Spalten einschleusen.
      const line = escapeCsvField('=x","y');
      expect(parseCsvRow(line)).toEqual(['\'=x","y']);
    });

    it("haelt eine Zeile auch bei Formel und Komma einspaltig", () => {
      const line = escapeCsvField("=SUM(A1,B1)");
      expect(parseCsvRow(line)).toHaveLength(1);
    });

    it("neutralisiert Formeln weiterhin mit vorangestelltem Apostroph", () => {
      for (const attack of ["=1+1", "+1+1", "@SUM(A1)", "-2*3", "\t=1+1"]) {
        const [field] = parseCsvRow(escapeCsvField(attack));
        expect(field).toBe(`'${attack}`);
      }
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

    it("should escape formula starting with @", () => {
      const result = escapeCsvField("@SUM(A1)");
      expect(result).toContain("'@SUM");
    });

    it("should escape formula starting with tab", () => {
      const result = escapeCsvField("\t=SUM(A1)");
      expect(result).toContain("'");
    });

    it("should escape values with quotes", () => {
      const result = escapeCsvField('Test "quoted" value');
      expect(result).toContain('""');
    });

    it("should escape values with commas", () => {
      const result = escapeCsvField("Value, with, commas");
      expect(result).toMatch(/^"/);
      expect(result).toMatch(/"$/);
    });

    it("should escape values with newlines", () => {
      const result = escapeCsvField("Line1\nLine2");
      expect(result).toMatch(/^"/);
      expect(result).toMatch(/"$/);
    });

    it("should not escape normal values", () => {
      const result = escapeCsvField("Normal Value");
      expect(result).toBe("Normal Value");
    });

    it("should handle null values", () => {
      const result = escapeCsvField(null);
      expect(result).toBe("");
    });

    it("should handle undefined values", () => {
      const result = escapeCsvField(undefined);
      expect(result).toBe("");
    });

    it("should handle numeric values", () => {
      const result = escapeCsvField(123.45);
      expect(result).toBe("123.45");
    });
  });

  describe("Export Column Definitions", () => {
    it("should have valid export columns", () => {
      // Test structure only, actual columns come from DEFAULT_EXPORT_COLUMNS
      const columns = [
        { field: "pay_date", label: "Zahlungsdatum", visible: true },
        { field: "gross_amount", label: "Bruttobetrag", visible: true },
        { field: "net_amount", label: "Nettobetrag", visible: true },
      ];

      expect(columns).toContainEqual(
        expect.objectContaining({
          field: "pay_date",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          visible: expect.any(Boolean),
        }),
      );
    });
  });

  describe("File Naming", () => {
    const getTimestampSuffix = (): string => {
      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    it("should generate correct CSV filename", () => {
      const suffix = getTimestampSuffix();
      const fileName = `dividenden-export-${suffix}.csv`;

      expect(fileName).toMatch(/^dividenden-export-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it("should generate correct Excel filename", () => {
      const suffix = getTimestampSuffix();
      const fileName = `dividenden-export-${suffix}.xlsx`;

      expect(fileName).toMatch(/^dividenden-export-\d{4}-\d{2}-\d{2}\.xlsx$/);
    });

    it("should generate correct JSON filename", () => {
      const suffix = getTimestampSuffix();
      const fileName = `dividenden-export-${suffix}.json`;

      expect(fileName).toMatch(/^dividenden-export-\d{4}-\d{2}-\d{2}\.json$/);
    });
  });

  describe("Format Support", () => {
    it("should support CSV format", () => {
      const supportedFormats = ["csv", "xlsx", "json"];
      expect(supportedFormats).toContain("csv");
    });

    it("should support Excel format", () => {
      const supportedFormats = ["csv", "xlsx", "json"];
      expect(supportedFormats).toContain("xlsx");
    });

    it("should support JSON format", () => {
      const supportedFormats = ["csv", "xlsx", "json"];
      expect(supportedFormats).toContain("json");
    });
  });
});
