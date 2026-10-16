import { describe, expect, it } from "vitest";
import { Money, MoneyDecimal, EUR } from "@/lib/money";
import {
  DEFAULT_SECURITY_SORT,
  defaultDirectionFor,
  securitySortOptions,
  sortAssetRows,
  type SecuritySort,
} from "@/features/securities/sortSecurities";
import type { AssetPosition, AssetRow } from "@/features/securities/assetRows";
import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * Sortierung der Assetliste. Geprueft wird vor allem, wohin Zeilen **ohne**
 * Wert wandern: „Sortiere nach Ticker" darf ein Asset ohne Ticker nicht an die
 * Spitze setzen, und „Nach Wert" kein Papier ohne Bestand.
 */
function row(
  overrides: Partial<Security> & { name: string },
  position: Partial<AssetPosition> | null = null,
  depotName: string | null = null,
): AssetRow {
  return {
    security: {
      id: overrides.name,
      ticker: null,
      sector: null,
      country: null,
      default_depot_id: null,
      archived_at: null,
      ...overrides,
    } as Security,
    depotName,
    position:
      position === null
        ? null
        : {
            asOf: "2026-08-03",
            marketValue: null,
            allocationPercent: null,
            gain: null,
            gainPercent: null,
            annualDividend: null,
            dividendYield: null,
            ...position,
          },
  };
}

const euro = (value: string) => Money.fromString(value, EUR);

const APPLE = row({ name: "Apple", ticker: "AAPL", sector: "Technologie" });
const BASF = row({ name: "BASF", ticker: "BAS", sector: "Chemie" });
const OHNE = row({ name: "Ohne Angaben" });

const namesOf = (rows: readonly AssetRow[]) => rows.map((entry) => entry.security.name);
const sort = (field: SecuritySort["field"], direction: SecuritySort["direction"]) =>
  namesOf(sortAssetRows([OHNE, BASF, APPLE], { field, direction }));

describe("sortAssetRows", () => {
  it("sortiert nach Name in beide Richtungen", () => {
    expect(sort("name", "asc")).toEqual(["Apple", "BASF", "Ohne Angaben"]);
    expect(sort("name", "desc")).toEqual(["Ohne Angaben", "BASF", "Apple"]);
  });

  it("stellt Zeilen ohne Wert in beiden Richtungen ans Ende", () => {
    expect(sort("ticker", "asc")).toEqual(["Apple", "BASF", "Ohne Angaben"]);
    expect(sort("ticker", "desc")).toEqual(["BASF", "Apple", "Ohne Angaben"]);
  });

  it("sortiert nach dem Namen des Standard-Depots, nicht nach dessen Kennung", () => {
    const rows = [
      row({ name: "Erstes", default_depot_id: "dep-z" }, null, "Zweitdepot"),
      row({ name: "Zweites", default_depot_id: "dep-a" }, null, "Erstdepot"),
    ];

    expect(
      namesOf(sortAssetRows(rows, { field: "depot", direction: "asc" })),
      // Erstdepot vor Zweitdepot — also „Zweites" zuerst.
    ).toEqual(["Zweites", "Erstes"]);
  });

  it("sortiert nach Depotwert, groesste Position zuerst", () => {
    const rows = [
      row({ name: "Klein" }, { marketValue: euro("40.00") }),
      row({ name: "Gross" }, { marketValue: euro("26000.00") }),
      row({ name: "Mittel" }, { marketValue: euro("1200.00") }),
    ];

    expect(namesOf(sortAssetRows(rows, { field: "value", direction: "desc" }))).toEqual([
      "Gross",
      "Mittel",
      "Klein",
    ]);
  });

  it("stellt Assets ohne Position bei Zahlenfeldern ans Ende", () => {
    const rows = [
      row({ name: "Verkauft" }),
      row({ name: "Gehalten" }, { annualDividend: euro("60.00") }),
      // Gehalten, aber die Quelle nennt keinen Betrag — auch das ist kein 0.
      row({ name: "Ohne Betrag" }, {}),
    ];

    for (const direction of ["asc", "desc"] as const) {
      const sorted = namesOf(sortAssetRows(rows, { field: "expected", direction }));
      expect(sorted[0]).toBe("Gehalten");
      expect(sorted.slice(1)).toEqual(["Ohne Betrag", "Verkauft"]);
    }
  });

  it("sortiert nach Rendite und Gewinn", () => {
    const rows = [
      row(
        { name: "Solide" },
        { dividendYield: new MoneyDecimal("2.5"), gain: euro("10.00") },
      ),
      row(
        { name: "Stark" },
        { dividendYield: new MoneyDecimal("6.1"), gain: euro("-5.00") },
      ),
    ];

    expect(namesOf(sortAssetRows(rows, { field: "yield", direction: "desc" }))).toEqual([
      "Stark",
      "Solide",
    ]);
    expect(namesOf(sortAssetRows(rows, { field: "gain", direction: "desc" }))).toEqual([
      "Solide",
      "Stark",
    ]);
  });

  it("bricht Gleichstand ueber den Namen auf", () => {
    const rows = [
      row({ name: "Zeta", sector: "Chemie" }),
      row({ name: "Alpha", sector: "Chemie" }),
    ];

    expect(namesOf(sortAssetRows(rows, { field: "sector", direction: "desc" }))).toEqual([
      "Alpha",
      "Zeta",
    ]);
  });

  it("laesst die Eingabe unveraendert", () => {
    const rows = [BASF, APPLE];
    const sorted = sortAssetRows(rows, DEFAULT_SECURITY_SORT);

    expect(namesOf(rows)).toEqual(["BASF", "Apple"]);
    expect(namesOf(sorted)).toEqual(["Apple", "BASF"]);
  });
});

describe("Sortierauswahl", () => {
  it("bietet Positionsfelder nur mit importiertem Depotstand an", () => {
    const withoutPositions = securitySortOptions(false).map((option) => option.value);
    const withPositions = securitySortOptions(true).map((option) => option.value);

    expect(withoutPositions).not.toContain("value");
    expect(withPositions.slice(0, 4)).toEqual(["value", "expected", "yield", "gain"]);
  });

  it("beginnt bei Zahlenfeldern absteigend, bei Textfeldern aufsteigend", () => {
    expect(defaultDirectionFor("value")).toBe("desc");
    expect(defaultDirectionFor("name")).toBe("asc");
  });
});
