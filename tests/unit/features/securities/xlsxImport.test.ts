import { describe, expect, it } from "vitest";
import { mapWorksheetToSecurities } from "@/features/securities/xlsxImport";
import type { WorksheetTable } from "@/lib/xlsx/parseWorkbook";

function table(headers: string[], rows: (string | number | null)[][]): WorksheetTable {
  return { headers, rows };
}

describe("mapWorksheetToSecurities", () => {
  it("mappt Symbol/Name/ISIN/WKN und leitet das Land aus der ISIN ab", () => {
    const result = mapWorksheetToSecurities(
      table(
        ["Symbol", "Name", "ISIN", "WKN"],
        [["ABT", "Abbott Laboratories", "US0028241000", "850103"]],
      ),
    );
    expect(result.invalid).toEqual([]);
    expect(result.valid).toEqual([
      {
        name: "Abbott Laboratories",
        ticker: "ABT",
        isin: "US0028241000",
        wkn: "850103",
        country: "US",
        dataQuality: "ok",
        warnings: [],
        sourceRow: 2,
      },
    ]);
  });

  it("erkennt Spalten unabhängig von Groß-/Kleinschreibung und Reihenfolge", () => {
    const result = mapWorksheetToSecurities(
      table(
        ["isin", "name", "wkn", "symbol"],
        [["DE0008404005", "Allianz SE", "840400", "ALV"]],
      ),
    );
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]?.country).toBe("DE");
  });

  it("wirft, wenn keine Name-Spalte gefunden wird", () => {
    expect(() =>
      mapWorksheetToSecurities(table(["Symbol", "ISIN"], [["ABT", "US0028241000"]])),
    ).toThrow(/Name/);
  });

  it("markiert Zeilen ohne Namen als ungültig, statt sie zu übernehmen", () => {
    const result = mapWorksheetToSecurities(
      table(
        ["Symbol", "Name"],
        [
          ["ABT", ""],
          ["XYZ", null],
        ],
      ),
    );
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([
      { sourceRow: 2, reason: "Name fehlt" },
      { sourceRow: 3, reason: "Name fehlt" },
    ]);
  });

  it("überspringt komplett leere Zeilen (z. B. eine Summenzeile) stillschweigend", () => {
    const result = mapWorksheetToSecurities(
      table(
        ["Symbol", "Name", "ISIN", "WKN"],
        [
          ["ABT", "Abbott Laboratories", "US0028241000", "850103"],
          [null, null, null, null],
        ],
      ),
    );
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toEqual([]);
  });

  it("verwirft eine ungültige ISIN, markiert die Zeile aber als 'needs_review'", () => {
    const result = mapWorksheetToSecurities(
      table(["Symbol", "Name", "ISIN"], [["ABT", "Abbott Laboratories", "keine-isin"]]),
    );
    expect(result.valid[0]?.isin).toBeNull();
    expect(result.valid[0]?.country).toBeNull();
    expect(result.valid[0]?.dataQuality).toBe("needs_review");
    expect(result.valid[0]?.warnings).toHaveLength(1);
  });

  it("verwirft einen ungültigen Ticker und eine ungültige WKN ebenso", () => {
    const result = mapWorksheetToSecurities(
      table(
        ["Symbol", "Name", "WKN"],
        [["***zu lang für einen Ticker***", "Beispiel AG", "zu-lang-fuer-wkn"]],
      ),
    );
    expect(result.valid[0]?.ticker).toBeNull();
    expect(result.valid[0]?.wkn).toBeNull();
    expect(result.valid[0]?.dataQuality).toBe("needs_review");
  });

  it("markiert eine Zeile ohne Ticker und ohne ISIN als 'incomplete'", () => {
    const result = mapWorksheetToSecurities(table(["Name"], [["Nur ein Name GmbH"]]));
    expect(result.valid[0]?.dataQuality).toBe("incomplete");
  });

  it("nummeriert sourceRow anhand der Originaldatei (Kopfzeile = 1)", () => {
    const result = mapWorksheetToSecurities(
      table(["Name"], [["Erste AG"], [null], ["Dritte AG"]]),
    );
    expect(result.valid.map((row) => row.sourceRow)).toEqual([2, 4]);
  });
});
