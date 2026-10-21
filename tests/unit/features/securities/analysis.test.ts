import { describe, expect, it } from "vitest";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  analyzePortfolio,
  collapseSlices,
  type AnalysisFacets,
  type PortfolioAnalysis,
} from "@/features/securities/analysis";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";

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
    dividend_yield_on_buyin: null,
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

const FACETS = new Map<string, AnalysisFacets>([
  ["sec-a", { sector: "Health Care", country: "US", currency: "USD" }],
  ["sec-b", { sector: "Real Estate", country: "DE", currency: "EUR" }],
  ["sec-c", { sector: "Health Care", country: "FR", currency: "EUR" }],
  // Ein ETF: Beim Import wurde „mixed" verworfen, es bleibt nichts.
  ["sec-etf", { sector: null, country: null, currency: null }],
]);

function analyze(rows: SecuritySnapshot[], measure: "wert" | "dividende" = "wert") {
  const result = analyzePortfolio(rows, FACETS, measure);
  if (result.kind !== "ok") throw new Error(`erwartet ok, war ${result.kind}`);
  return result.analysis;
}

const labels = (slices: PortfolioAnalysis["sectors"]) => slices.map((s) => s.label);

describe("analyzePortfolio", () => {
  it("meldet ohne Depotstand „empty“", () => {
    expect(analyzePortfolio([], FACETS, "wert")).toEqual({ kind: "empty" });
  });

  it("nutzt nur den jüngsten Stichtag", () => {
    const analysis = analyze([
      snapshot({ as_of: "2026-02-02", market_value: "9999.00" }),
      snapshot({ security_id: "sec-b", market_value: "300.00" }),
    ]);
    expect(analysis.positions).toBe(1);
    expect(formatMoney(analysis.total)).toMatch(/^300,00\s€$/);
  });

  it("teilt nach Branche auf, größter Anteil zuerst, „ohne Angabe“ am Ende", () => {
    const analysis = analyze([
      snapshot({ security_id: "sec-etf", market_value: "900.00" }),
      snapshot({ security_id: "sec-a", market_value: "300.00" }),
      snapshot({ security_id: "sec-b", market_value: "500.00" }),
      snapshot({ security_id: "sec-c", market_value: "300.00" }),
    ]);
    expect(labels(analysis.sectors)).toEqual([
      "Health Care",
      "Real Estate",
      "ohne Angabe",
    ]);
    expect(formatPercent(analysis.sectors[0].share, 1)).toBe("30,0 %");
    expect(analysis.sectors[0].positions).toBe(2);
  });

  it("wechselt die Bezugsgröße auf die erwartete Dividende", () => {
    const rows = [
      snapshot({
        security_id: "sec-a",
        market_value: "900.00",
        annual_dividend_total: "10.00",
      }),
      snapshot({
        security_id: "sec-b",
        market_value: "100.00",
        annual_dividend_total: "30.00",
      }),
    ];
    expect(labels(analyze(rows, "wert").sectors)).toEqual(["Health Care", "Real Estate"]);
    expect(labels(analyze(rows, "dividende").sectors)).toEqual([
      "Real Estate",
      "Health Care",
    ]);
  });

  it("lässt Positionen ohne Betrag aus und zählt sie", () => {
    // Ein Thesaurierer traegt zur Dividende nichts bei — ein Ringstueck von
    // null Prozent waere keine Auskunft.
    const analysis = analyze(
      [
        snapshot({ security_id: "sec-a", annual_dividend_total: "40.00" }),
        snapshot({
          security_id: "sec-etf",
          annual_dividend_total: null,
          dividend_frequency: "none",
          asset_type: "etf",
        }),
      ],
      "dividende",
    );
    expect(analysis.withoutAmount).toBe(1);
    expect(labels(analysis.assetTypes)).toEqual(["Aktien"]);
    expect(labels(analysis.frequencies)).toEqual(["Vierteljährlich"]);
  });

  it("fasst Länder zu Regionen zusammen, mit Ländern darunter", () => {
    const analysis = analyze([
      snapshot({ security_id: "sec-a", market_value: "400.00" }),
      snapshot({ security_id: "sec-b", market_value: "400.00" }),
      snapshot({ security_id: "sec-c", market_value: "200.00" }),
    ]);
    expect(labels(analysis.regions)).toEqual(["Europa", "Nordamerika"]);
    expect(labels(analysis.regions[0].children)).toEqual(["Deutschland", "Frankreich"]);
    expect(formatPercent(analysis.regions[0].children[1].share, 1)).toBe("20,0 %");
  });

  it("teilt nach Ausschüttungswährung der Stammdaten auf, nicht nach Depotwährung", () => {
    const analysis = analyze([
      snapshot({ security_id: "sec-a", market_value: "600.00" }),
      snapshot({ security_id: "sec-b", market_value: "400.00" }),
    ]);
    expect(labels(analysis.currencies)).toEqual(["USD", "EUR"]);
  });

  it("addiert keine Beträge verschiedener Depotwährungen", () => {
    expect(
      analyzePortfolio(
        [snapshot(), snapshot({ security_id: "sec-b", currency: "USD" })],
        FACETS,
        "wert",
      ),
    ).toEqual({ kind: "mixedCurrency" });
  });
});

describe("collapseSlices", () => {
  it("fasst die kleinsten Kategorien zu „Sonstige“ zusammen, „ohne Angabe“ bleibt", () => {
    const analysis = analyze(
      ["A", "B", "C", "D", "E", "F"]
        .map((sector, index) => {
          const id = `sec-${sector}`;
          FACETS.set(id, { sector, country: null, currency: null });
          return snapshot({
            security_id: id,
            market_value: `${String(600 - index * 100)}.00`,
          });
        })
        .concat(snapshot({ security_id: "sec-etf", market_value: "50.00" })),
    );
    const ring = collapseSlices(analysis.sectors);
    expect(labels(ring)).toEqual(["A", "B", "C", "Sonstige", "ohne Angabe"]);
    expect(formatMoney(ring[3].amount)).toMatch(/^600,00\s€$/);
    expect(ring[3].positions).toBe(3);
  });
});
