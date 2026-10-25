import { describe, expect, it } from "vitest";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import {
  forecastTwelveMonths,
  monthGaps,
  type ForecastFacets,
  type TwelveMonthForecast,
} from "@/features/securities/forecast";
import { parseForecastSettings } from "@/features/securities/forecastSettings";
import { planPurchase, purchaseCandidates } from "@/features/planner/purchase";

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
];

const FACETS = new Map<string, ForecastFacets>([
  ["sec-a", { name: "Alpha", payoutMonths: [1, 4, 7, 10] }],
  ["sec-b", { name: "Beta", payoutMonths: [5] }],
  ["sec-c", { name: "Gamma", payoutMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
  ["sec-d", { name: "Delta", payoutMonths: [2, 8] }],
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

function plan(
  input: Partial<Parameters<typeof planPurchase>[0]> & { excluded?: string[] } = {},
) {
  const base = forecast();
  const candidates = purchaseCandidates(base, SNAPSHOTS, new Set(input.excluded ?? []));
  return planPurchase({
    forecast: base,
    candidates,
    amount: 1000,
    focus: "dividende",
    mode: "einmal",
    buys: 3,
    ...input,
  });
}

describe("purchaseCandidates", () => {
  it("leitet Ertrag, Zahlmonate und Kurs aus Prognose und Depotstand ab", () => {
    const candidates = purchaseCandidates(forecast(), SNAPSHOTS, new Set());
    const alpha = candidates.find((candidate) => candidate.securityId === "sec-a");
    expect(alpha?.months).toEqual([1, 4, 7, 10]);
    expect(alpha?.perPayoutPerEuro.toString()).toBe("0.01");
    expect(alpha?.price?.toString()).toBe("100");
  });

  it("laesst ausgeschlossene Assets weg", () => {
    const ids = purchaseCandidates(forecast(), SNAPSHOTS, new Set(["sec-b"]))
      .map((candidate) => candidate.securityId)
      .sort();
    expect(ids).toEqual(["sec-a", "sec-c", "sec-d"]);
  });
});

describe("planPurchase", () => {
  it("Mehr Dividende: die ertragsstaerksten zu gleichen Teilen", () => {
    const result = plan({ buys: 2 });
    expect(result?.buys.map((buy) => [buy.name, buy.invest.toStringValue()])).toEqual([
      ["Alpha", "500.00"],
      ["Beta", "500.00"],
    ]);
    // 500 × 4 % + 500 × 6 % = 50 €
    expect(result?.annual.toStringValue()).toBe("50.00");
    expect(result?.yieldPercent.toString()).toBe("5");
    expect(result?.buys[1].shares?.toString()).toBe("10");
  });

  it("legt einen Rest, der keinen Schritt fuellt, auf den groessten Kauf", () => {
    const result = plan({ buys: 1, amount: 1020 });
    expect(result?.buys.map((buy) => buy.invest.toStringValue())).toEqual(["1020.00"]);
  });

  it("Dividendenwachstum: hohe CAGR schlaegt etwas mehr Rendite", () => {
    // Gamma: 3 % × 1,1^5 ≈ 4,83 % > Alpha 4 %, < Beta 6 %
    const result = plan({ focus: "wachstum", buys: 2 });
    expect(result?.buys.map((buy) => buy.name)).toEqual(["Beta", "Gamma"]);
  });

  it("Monate glaetten: hebt zuerst die Monate unter Ø", () => {
    const result = plan({ focus: "monate", buys: 3 });
    const before = result?.before ?? [];
    const after = result?.after ?? [];
    const shortfall = (values: typeof before) => {
      const numbers = values.map((value) => value.toChartNumber());
      const average = numbers.reduce((sum, value) => sum + value, 0) / 12;
      return numbers.reduce((sum, value) => sum + Math.max(0, average - value), 0);
    };
    expect(shortfall(after)).toBeLessThan(shortfall(before));
    // Delta zahlt in zwei Monaten unter Ø; Beta (Mai, weit ueber Ø) hilft nicht.
    expect(result?.buys[0].name).toBe("Delta");
    expect(result?.buys.map((buy) => buy.name)).not.toContain("Beta");
  });

  it("haelt den Mindestbetrag je Kauf ein", () => {
    const result = plan({ amount: 250, buys: 5 });
    expect(result?.buys).toHaveLength(2);
    for (const buy of result?.buys ?? []) {
      expect(buy.invest.toDecimal().greaterThanOrEqualTo(100)).toBe(true);
    }
  });

  it("Sparplaene: Wirkung nach zwoelf Raten", () => {
    const result = plan({ mode: "sparplan", amount: 100, buys: 1 });
    expect(result?.buys[0].invest.toStringValue()).toBe("100.00");
    expect(result?.invested.toStringValue()).toBe("1200.00");
    // 1.200 € in Beta zu 6 %
    expect(result?.annual.toStringValue()).toBe("72.00");
  });

  it("gibt nichts zurueck unter dem Mindestbetrag oder ohne Kandidaten", () => {
    expect(plan({ amount: 50 })).toBeNull();
    expect(plan({ excluded: ["sec-a", "sec-b", "sec-c", "sec-d"] })).toBeNull();
  });

  it("bleibt bei grossen Betraegen schnell", () => {
    const start = performance.now();
    plan({ focus: "monate", amount: 1_000_000, buys: 5 });
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("monthGaps mit Ausschluss", () => {
  it("schlaegt ausgeschlossene Assets nicht als Fueller vor", () => {
    const fillers = (excluded: string[]) =>
      monthGaps(forecast(), new Set(excluded)).gaps.flatMap((gap) =>
        gap.fillers.map((filler) => filler.securityId),
      );
    expect(fillers([])).toContain("sec-d");
    expect(fillers(["sec-d"])).not.toContain("sec-d");
  });
});

describe("parseForecastSettings", () => {
  it("liest ausgeschlossene Assets und verwirft ungueltige Listen", () => {
    const id = "6f1c2b9e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";
    expect(parseForecastSettings({ excluded: [id] }).excluded).toEqual([id]);
    expect(parseForecastSettings({ excluded: ["kein-uuid"] }).excluded).toEqual([]);
    expect(parseForecastSettings(null).excluded).toEqual([]);
    expect(parseForecastSettings({ monthlySavings: 500 }).monthlySavings).toBe(500);
  });
});

describe("Positionsgrenze", () => {
  // Depot 4.000 €, jede Position 1.000 €. Nach 1.000 € Kauf: 5.000 €.
  it("füllt eine Position bis zur Grenze und nennt den Rest", () => {
    // 30 % von 5.000 € = 1.500 €: Beta nimmt 500 €, ein Kauf ist gewählt.
    const result = plan({ buys: 1, capPercent: 30 });
    expect(result?.buys.map((buy) => [buy.name, buy.invest.toStringValue()])).toEqual([
      ["Beta", "500.00"],
    ]);
    expect(result?.unplaced.toStringValue()).toBe("500.00");
    expect(result?.invested.toStringValue()).toBe("500.00");
  });

  it("gibt mehr an die übrigen, wenn eine gewählte voll ist", () => {
    // 30 % von 5.200 € = 1.560 €: je 560 € Platz; 1.200 € passen in drei Käufe.
    const result = plan({ buys: 3, amount: 1200, capPercent: 30 });
    expect(result?.buys.map((buy) => buy.invest.toStringValue())).toEqual([
      "400.00",
      "400.00",
      "400.00",
    ]);
    expect(result?.unplaced.isZero()).toBe(true);
  });

  it("verteilt bei enger Grenze auf mehr Positionen", () => {
    // 25 % von 5.000 € = 1.250 €: je Position 250 € Platz.
    const result = plan({ buys: 4, capPercent: 25 });
    expect(result?.buys).toHaveLength(4);
    expect(result?.buys.every((buy) => buy.invest.toStringValue() === "250.00")).toBe(
      true,
    );
  });

  it("nennt, was keinen Platz findet", () => {
    // 5 % von 5.000 € = 250 €: Jede Position liegt mit 1.000 € darüber.
    const result = plan({ capPercent: 5 });
    expect(result?.buys).toHaveLength(0);
    expect(result?.unplaced.toStringValue()).toBe("1000.00");
  });

  it("hält die Grenze auch beim Glätten der Monate", () => {
    const result = plan({ focus: "monate", buys: 3, capPercent: 30 });
    expect(
      result?.buys.every((buy) => buy.invest.toDecimal().lessThanOrEqualTo(500)),
    ).toBe(true);
    expect(result?.unplaced.isZero()).toBe(true);
  });
});

describe("Sparplan im Hochlauf", () => {
  it("zählt im ersten Monat eine Rate, im zwölften alle", () => {
    const result = plan({ mode: "sparplan", amount: 100, buys: 1, focus: "dividende" });
    if (!result) throw new Error("Plan erwartet");
    const delta = (index: number) =>
      result.after[index].subtract(result.before[index]).toDecimal();
    // Beta zahlt im Mai (Index 6) 6 % auf 7 Raten, als Jahreswert 1.200 € × 6 % = 72 €.
    expect(result.annual.toStringValue()).toBe("72.00");
    expect(delta(6).toFixed(2)).toBe("42.00");
  });
});

describe("Positionsgrenze je Asset", () => {
  it("lässt eine eigene Grenze dem Standard vorgehen", () => {
    // Standard 30 % (500 € Platz), Beta mit eigener Grenze 40 % (1.000 € Platz).
    const result = plan({ buys: 1, capPercent: 30, caps: new Map([["sec-b", 40]]) });
    expect(result?.buys.map((buy) => [buy.name, buy.invest.toStringValue()])).toEqual([
      ["Beta", "1000.00"],
    ]);
  });
});
