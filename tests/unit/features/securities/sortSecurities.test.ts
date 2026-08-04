import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECURITY_SORT,
  sortSecurities,
  type SecuritySort,
} from "@/features/securities/sortSecurities";
import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * Sortierung der Unternehmensliste. Geprueft wird vor allem, wohin Zeilen
 * **ohne** Wert wandern: „Sortiere nach Ticker" darf ein Unternehmen ohne
 * Ticker nicht an die Spitze setzen.
 */
function security(overrides: Partial<Security> & { name: string }): Security {
  return {
    id: overrides.name,
    ticker: null,
    sector: null,
    country: null,
    default_depot_id: null,
    archived_at: null,
    ...overrides,
  } as Security;
}

const APPLE = security({ name: "Apple", ticker: "AAPL", sector: "Technologie" });
const BASF = security({ name: "BASF", ticker: "BAS", sector: "Chemie" });
const OHNE = security({ name: "Ohne Angaben" });

const namesOf = (rows: readonly Security[]) => rows.map((row) => row.name);
const sort = (field: SecuritySort["field"], direction: SecuritySort["direction"]) =>
  namesOf(sortSecurities([OHNE, BASF, APPLE], { field, direction }, () => null));

describe("sortSecurities", () => {
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
      security({ name: "Erstes", default_depot_id: "dep-z" }),
      security({ name: "Zweites", default_depot_id: "dep-a" }),
    ];
    const depotName = (row: Security) =>
      row.default_depot_id === "dep-z" ? "Zweitdepot" : "Erstdepot";

    expect(
      namesOf(sortSecurities(rows, { field: "depot", direction: "asc" }, depotName)),
      // Erstdepot vor Zweitdepot — also „Zweites" zuerst.
    ).toEqual(["Zweites", "Erstes"]);
  });

  it("bricht Gleichstand ueber den Namen auf", () => {
    const rows = [
      security({ name: "Zeta", sector: "Chemie" }),
      security({ name: "Alpha", sector: "Chemie" }),
    ];

    expect(
      namesOf(sortSecurities(rows, { field: "sector", direction: "desc" }, () => null)),
    ).toEqual(["Alpha", "Zeta"]);
  });

  it("laesst die Eingabe unveraendert", () => {
    const rows = [BASF, APPLE];
    const sorted = sortSecurities(rows, DEFAULT_SECURITY_SORT, () => null);

    expect(namesOf(rows)).toEqual(["BASF", "Apple"]);
    expect(namesOf(sorted)).toEqual(["Apple", "BASF"]);
  });
});
