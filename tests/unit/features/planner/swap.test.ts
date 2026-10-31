import { describe, expect, it } from "vitest";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import {
  forecastTwelveMonths,
  type ForecastFacets,
  type TwelveMonthForecast,
} from "@/features/securities/forecast";
import { planSwap, swapAlternatives, swapPositions } from "@/features/planner/swap";

const TODAY = { year: 2026, month: 10, day: 25 };

let counter = 0;
function snapshot(partial: Partial<SecuritySnapshot>): SecuritySnapshot {
  counter += 1;
  return {
    id: `snap-${String(counter)}`,
    user_id: "user-1",
    security_id: "sec-a",
    run_id: "run-1",
    as_of: "2026-10-20",
    quantity: "10.000000",
    buyin_per_share: null,
    buyin_total: "1000.00",
    price: "100.000000",
    market_value: "1000.00",
    gain_absolute: null,
    gain_relative: null,
    allocation: null,
    dividend_yield: null,
    dividend_yield_on_buyin: null,
    annual_dividend_total: "40.00",
    dividend_per_share: null,
    dividend_frequency: "quarterly",
    dividend_cagr: null,
    dividend_cagr_period: null,
    next_ex_date: null,
    next_pay_date: null,
    asset_type: "equity",
    currency: "EUR",
    created_at: "2026-10-20T10:00:00Z",
    ...partial,
  };
}

// Alpha: 4 % quartalsweise (Jan/Apr/Jul/Okt), Beta: 6 % jaehrlich im Mai,
// Gamma: 3 % monatlich mit 10 % CAGR, Delta: 1 % halbjaehrlich (Feb/Aug). Ohne Zahlungen rechnet die Prognose brutto.
const SNAPSHOTS = [
  snapshot({ security_id: "sec-a" }),
  snapshot({
    security_id: "sec-b",
    annual_dividend_total: "60.00",
    dividend_frequency: "annually",
    price: "50.000000",
  }),
  snapshot({
    security_id: "sec-c",
    annual_dividend_total: "30.00",
    dividend_frequency: "monthly",
    dividend_cagr: "0.100000",
  }),
  snapshot({
    security_id: "sec-d",
    annual_dividend_total: "10.00",
    dividend_frequency: "biannually",
  }),
  // Epsilon: 500 € ohne Ausschuettung (z. B. ein thesaurierender ETF).
  snapshot({
    security_id: "sec-e",
    market_value: "500.00",
    annual_dividend_total: null,
    dividend_frequency: null,
  }),
];

const FACETS = new Map<string, ForecastFacets>([
  ["sec-a", { name: "Alpha", payoutMonths: [1, 4, 7, 10] }],
  ["sec-b", { name: "Beta", payoutMonths: [5] }],
  ["sec-c", { name: "Gamma", payoutMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
  ["sec-d", { name: "Delta", payoutMonths: [2, 8] }],
  ["sec-e", { name: "Epsilon", payoutMonths: [] }],
]);

function forecast(): TwelveMonthForecast {
  const result = forecastTwelveMonths({
    snapshots: SNAPSHOTS,
    facets: FACETS,
    payments: [],
    today: TODAY,
  });
  if (result.kind !== "ok") throw new Error("Prognose erwartet");
  return result.forecast;
}

const NAMES = new Map([...FACETS].map(([id, facet]) => [id, facet.name]));

function positions() {
  return swapPositions(forecast(), SNAPSHOTS, NAMES);
}

function position(id: string) {
  const found = positions().find((entry) => entry.securityId === id);
  if (!found) throw new Error(`Position ${id} erwartet`);
  return found;
}

function swap(sell: string, buy: string, amount: number) {
  return planSwap({ forecast: forecast(), sell: position(sell), buy: position(buy), amount });
}

describe("swapPositions", () => {
  it("fuehrt alle Positionen mit Marktwert, auch ohne Ausschuettung, nach Namen", () => {
    const list = positions();
    expect(list.map((entry) => entry.name)).toEqual([
      "Alpha",
      "Beta",
      "Delta",
      "Epsilon",
      "Gamma",
    ]);
    const epsilon = position("sec-e");
    expect(epsilon.months).toEqual([]);
    expect(epsilon.perPayoutPerEuro.toString()).toBe("0");
    expect(epsilon.marketValue.toString()).toBe("500");
  });
});

describe("planSwap", () => {
  it("rechnet Wegfall und Zugewinn je Monat und im Jahr", () => {
    const result = swap("sec-a", "sec-b", 500);
    // Alpha: 500 × 1 % je Quartal faellt weg (4 × 5 €), Beta: 500 × 6 % im Mai.
    expect(result?.sell.annual.toStringValue()).toBe("20.00");
    expect(result?.buy.annual.toStringValue()).toBe("30.00");
    expect(result?.change.toStringValue()).toBe("10.00");
    expect(result?.buy.shares?.toString()).toBe("10");
    expect(result?.sell.yieldPercent.toString()).toBe("4");
    expect(result?.buy.yieldPercent.toString()).toBe("6");
    const total = (values: { toDecimal: () => { toNumber: () => number } }[]) =>
      values.reduce((sum, value) => sum + value.toDecimal().toNumber(), 0);
    expect(total(result?.after ?? []) - total(result?.before ?? [])).toBeCloseTo(10);
  });

  it("verschiebt die Gewichtung bei gleichem Depotwert", () => {
    const result = swap("sec-a", "sec-b", 500);
    // Depot 4.500 €: Alpha 1.000 → 500, Beta 1.000 → 1.500.
    expect(result?.sell.shareBefore.toFixed(2)).toBe("22.22");
    expect(result?.sell.shareAfter.toFixed(2)).toBe("11.11");
    expect(result?.buy.shareAfter.toFixed(2)).toBe("33.33");
  });

  it("begrenzt den Betrag auf den Marktwert der verkauften Position", () => {
    expect(swap("sec-e", "sec-b", 9000)?.amount.toStringValue()).toBe("500.00");
  });

  it("rechnet fuenf Jahre voraus nur mit bekanntem Wachstum", () => {
    // Epsilon schuettet nicht aus, Gamma waechst 10 % p. a.: 15 € × 1,1⁵.
    expect(swap("sec-e", "sec-c", 500)?.changeInFiveYears?.toStringValue()).toBe(
      "24.16",
    );
    // Alpha nennt keinen CAGR.
    expect(swap("sec-a", "sec-c", 500)?.changeInFiveYears).toBeNull();
  });

  it("verwirft Tausch in dieselbe Position und Betrag 0", () => {
    expect(swap("sec-a", "sec-a", 500)).toBeNull();
    expect(swap("sec-a", "sec-b", 0)).toBeNull();
  });
});

describe("swapAlternatives", () => {
  it("nennt ausschuettende Positionen nach Ertrag, ohne ausgeschlossene", () => {
    expect(
      swapAlternatives(positions(), ["sec-a"], 5).map((entry) => entry.name),
    ).toEqual(["Beta", "Gamma", "Delta"]);
    expect(swapAlternatives(positions(), [], 2).map((entry) => entry.name)).toEqual([
      "Beta",
      "Alpha",
    ]);
  });
});
