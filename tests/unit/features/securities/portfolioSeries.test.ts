import { describe, expect, it } from "vitest";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  buildPortfolioSeries,
  EMPTY_PORTFOLIO_SERIES,
} from "@/features/securities/snapshots";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";

/**
 * Die Zeitreihe, auf der der Entwicklungsbereich aufsetzt.
 *
 * Sie ist bewusst ein Domaenentyp: Der Statistikkontext bleibt dadurch frei von
 * Datenbanktypen, und diese Regeln lassen sich ohne Oberflaeche pruefen.
 */
let counter = 0;
function snapshot(partial: Partial<SecuritySnapshot> = {}): SecuritySnapshot {
  counter += 1;
  return {
    id: `snap-${String(counter)}`,
    user_id: "user-1",
    security_id: "sec-a",
    run_id: "run-1",
    as_of: "2026-08-03",
    quantity: "10.000000",
    buyin_per_share: null,
    buyin_total: "1000.00",
    price: null,
    market_value: "1200.00",
    gain_absolute: null,
    gain_relative: null,
    allocation: null,
    dividend_yield: null,
    dividend_yield_on_buyin: "0.043807",
    annual_dividend_total: "60.00",
    dividend_per_share: null,
    dividend_frequency: "quarterly",
    dividend_cagr: null,
    dividend_cagr_period: null,
    next_ex_date: null,
    next_pay_date: null,
    asset_type: "equity",
    currency: "EUR",
    created_at: "2026-08-04T10:00:00Z",
    ...partial,
  };
}

describe("buildPortfolioSeries", () => {
  it("liefert ohne Depotstände eine leere Reihe", () => {
    expect(buildPortfolioSeries([])).toEqual(EMPTY_PORTFOLIO_SERIES);
  });

  it("bildet je Stichtag einen Punkt, ältester zuerst", () => {
    const series = buildPortfolioSeries([
      snapshot({ as_of: "2026-08-03", market_value: "1200.00" }),
      snapshot({ as_of: "2026-02-02", market_value: "900.00" }),
      snapshot({ as_of: "2026-05-01", market_value: "1000.00" }),
    ]);
    expect(series.points.map((point) => point.asOf)).toEqual([
      "2026-02-02",
      "2026-05-01",
      "2026-08-03",
    ]);
    expect(series.latest?.asOf).toBe("2026-08-03");
  });

  it("summiert je Stichtag nur dessen eigene Zeilen", () => {
    const series = buildPortfolioSeries([
      snapshot({ security_id: "sec-a", as_of: "2026-02-02", market_value: "500.00" }),
      snapshot({ security_id: "sec-b", as_of: "2026-02-02", market_value: "400.00" }),
      snapshot({ security_id: "sec-a", as_of: "2026-08-03", market_value: "1200.00" }),
    ]);
    const [alt, neu] = series.points;
    expect(alt.marketValue && formatMoney(alt.marketValue)).toMatch(/^900,00\s€$/);
    expect(alt.positions).toBe(2);
    expect(neu.marketValue && formatMoney(neu.marketValue)).toMatch(/^1\.200,00\s€$/);
    expect(neu.positions).toBe(1);
  });

  it("nimmt die erwartete Jahresdividende nur aus dem jüngsten Stand", () => {
    // Ein aelterer Stand beschriebe eine Stueckzahl, die es so nicht mehr gibt.
    const series = buildPortfolioSeries([
      snapshot({
        security_id: "sec-a",
        as_of: "2026-02-02",
        annual_dividend_total: "24.00",
      }),
      snapshot({
        security_id: "sec-a",
        as_of: "2026-08-03",
        annual_dividend_total: "60.00",
      }),
    ]);
    const expected = series.expectedBySecurity.get("sec-a");
    expect(expected && formatMoney(expected)).toMatch(/^60,00\s€$/);
    expect(series.expectedBySecurity.size).toBe(1);
  });

  it("merkt sich, welche Unternehmen im jüngsten Stand gehalten werden", () => {
    // Der Entwicklungsbereich muss „nicht mehr gehalten" (traegt kuenftig null
    // bei) von „gehalten, aber ohne Betrag der Quelle" (unbekannt)
    // unterscheiden. `expectedBySecurity` allein wirft beides zusammen.
    const series = buildPortfolioSeries([
      snapshot({ security_id: "sec-a", as_of: "2026-02-02" }),
      snapshot({ security_id: "sec-b", as_of: "2026-08-03" }),
      // Gehalten, aber die Quelle nennt keinen Betrag.
      snapshot({
        security_id: "sec-etf",
        as_of: "2026-08-03",
        annual_dividend_total: null,
      }),
    ]);
    expect([...series.heldSecurityIds].sort()).toEqual(["sec-b", "sec-etf"]);
    // sec-etf ist gehalten, hat aber keine Erwartung — der Unterschied zaehlt.
    expect(series.expectedBySecurity.has("sec-etf")).toBe(false);
    expect(series.heldSecurityIds.has("sec-a")).toBe(false);
  });

  it("rechnet die Rendite auf den Einstand in Prozentpunkte um", () => {
    const series = buildPortfolioSeries([snapshot()]);
    const onBuyin = series.yieldOnBuyinBySecurity.get("sec-a");
    expect(onBuyin && formatPercent(onBuyin, 2)).toBe("4,38\u00A0%");
  });
});
