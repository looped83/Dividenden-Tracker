import { describe, expect, it } from "vitest";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import {
  forecastTwelveMonths,
  type ForecastFacets,
  type TwelveMonthForecast,
} from "@/features/securities/forecast";
import { planSwap, swapPositions } from "@/features/planner/swap";

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

function swap(
  sell: string,
  amount: number,
  input: Partial<Omit<Parameters<typeof planSwap>[0], "sell" | "amount">> = {},
) {
  return planSwap({
    forecast: forecast(),
    snapshots: SNAPSHOTS,
    sell: position(sell),
    amount,
    focus: "dividende",
    buys: 2,
    caps: new Map(),
    excluded: new Set(),
    capPercent: null,
    ...input,
  });
}

describe("swapPositions", () => {
  it("fuehrt alle Positionen mit Marktwert, auch ohne Ausschuettung, nach Namen", () => {
    expect(positions().map((entry) => entry.name)).toEqual([
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
  it("verteilt den Erloes auf mehrere Titel und rechnet den Wegfall gegen", () => {
    const result = swap("sec-a", 1000);
    // Alpha faellt weg (4 × 10 €), Beta und Gamma bekommen je 500 €: 30 € + 15 €.
    expect(result?.lost.toStringValue()).toBe("40.00");
    expect(
      result?.purchase.buys.map((buy) => [buy.name, buy.invest.toStringValue()]),
    ).toEqual([
      ["Beta", "500.00"],
      ["Gamma", "500.00"],
    ]);
    expect(result?.change.toStringValue()).toBe("5.00");
    expect(result?.sellYieldPercent.toString()).toBe("4");
    // Januar: Alpha fehlt (−10 €), Gamma kommt dazu (+1,25 €).
    const jan = forecast().months.findIndex((month) => month.month === 1);
    expect(result?.before[jan].subtract(result.withoutSale[jan]).toStringValue()).toBe(
      "10.00",
    );
    expect(result?.after[jan].subtract(result.withoutSale[jan]).toStringValue()).toBe(
      "1.25",
    );
  });

  it("kauft die verkaufte Position nicht zurueck und achtet Ausschluesse", () => {
    const result = swap("sec-b", 1000, { buys: 1, excluded: new Set(["sec-a"]) });
    expect(result?.purchase.buys.map((buy) => buy.name)).toEqual(["Gamma"]);
    expect(result?.change.toStringValue()).toBe("-30.00");
  });

  it("misst die Zielgewichtung am Depot ohne den verkauften Teil", () => {
    // Depot bleibt 4.500 €: Gamma (1.000 €) hat bis 30 % noch 350 € Platz.
    const result = swap("sec-e", 500, {
      buys: 1,
      caps: new Map([["sec-c", 30]]),
      capPercent: 0,
    });
    expect(result?.purchase.invested.toStringValue()).toBe("350.00");
    expect(result?.purchase.unplaced.toStringValue()).toBe("150.00");
  });

  it("streut auch beim Glaetten der Monate auf mehrere Titel", () => {
    const result = swap("sec-a", 1200, { focus: "monate", buys: 3 });
    const invests =
      result?.purchase.buys.map((buy) => buy.invest.toDecimal().toNumber()) ?? [];
    expect(invests.length).toBeGreaterThanOrEqual(2);
    for (const invest of invests) expect(invest).toBeLessThanOrEqual(400);
  });

  it("laesst bei krummen Betraegen keinen Rest liegen", () => {
    // 1.000 € auf drei Kaeufe: je hoechstens 350 € (333 € auf 50 € aufgerundet).
    const result = swap("sec-a", 1000, { focus: "monate", buys: 3 });
    expect(result?.purchase.unplaced.toStringValue()).toBe("0.00");
  });

  it("begrenzt den Betrag auf den Marktwert und verwirft 0", () => {
    expect(swap("sec-e", 9000)?.amount.toStringValue()).toBe("500.00");
    expect(swap("sec-a", 0)).toBeNull();
  });
});
