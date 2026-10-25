import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import {
  forecastTwelveMonths,
  type ForecastFacets,
  type TwelveMonthForecast,
} from "@/features/securities/forecast";
import { purchaseCandidates } from "@/features/planner/purchase";
import {
  activeMonthlyTotal,
  monthlyAmount,
  nextExecution,
  parseSavingsPlans,
  savingsPlanOverview,
  toStoredSavingsPlans,
  type SavingsPlan,
} from "@/features/planner/savingsPlans";

const TODAY = { year: 2026, month: 10, day: 25 };
const SECURITY = "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e5f";

function plan(partial: Partial<SavingsPlan> = {}): SavingsPlan {
  return {
    id: "plan1",
    securityId: "sec-a",
    depotId: null,
    amount: Money.fromString("100", EUR),
    interval: "monthly",
    nextDate: null,
    paused: false,
    ...partial,
  };
}

function snapshot(partial: Partial<SecuritySnapshot>): SecuritySnapshot {
  return {
    id: `snap-${partial.security_id ?? "x"}`,
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

// Alpha: 4 % quartalsweise (Jan/Apr/Jul/Okt), Gamma: 3 % monatlich. Ohne
// Zahlungen rechnet die Prognose brutto.
const SNAPSHOTS = [
  snapshot({ security_id: "sec-a" }),
  snapshot({
    security_id: "sec-c",
    annual_dividend_total: "30.00",
    dividend_frequency: "monthly",
  }),
];
const FACETS = new Map<string, ForecastFacets>([
  ["sec-a", { name: "Alpha", payoutMonths: [1, 4, 7, 10] }],
  ["sec-c", { name: "Gamma", payoutMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
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

function overview(plans: SavingsPlan[]) {
  const base = forecast();
  const names = new Map([...FACETS].map(([id, facets]) => [id, facets.name]));
  return savingsPlanOverview(
    base,
    purchaseCandidates(base, SNAPSHOTS, new Set()),
    plans,
    names,
  );
}

describe("parseSavingsPlans", () => {
  it("liest gültige Pläne und lässt ungültige weg", () => {
    const plans = parseSavingsPlans([
      {
        id: "abc",
        securityId: SECURITY,
        depotId: null,
        amount: "30.00",
        interval: "weekly",
        nextDate: "2026-11-02",
        paused: false,
      },
      { id: "bad", securityId: SECURITY, amount: "0", interval: "monthly" },
      { id: "bad2", securityId: "kein-uuid", amount: "10", interval: "monthly" },
      { id: "bad3", securityId: SECURITY, amount: "10", interval: "daily" },
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].interval).toBe("weekly");
    expect(plans[0].amount.toStringValue()).toBe("30.00");
  });

  it("ergänzt fehlende Felder statt den Plan zu verwerfen", () => {
    const [entry] = parseSavingsPlans([
      { id: "abc", securityId: SECURITY, amount: "50", interval: "monthly" },
    ]);
    expect(entry.depotId).toBeNull();
    expect(entry.nextDate).toBeNull();
    expect(entry.paused).toBe(false);
  });

  it("liest keine Liste als leer", () => {
    expect(parseSavingsPlans(null)).toEqual([]);
    expect(parseSavingsPlans({})).toEqual([]);
  });

  it("speichert eine leere Liste als null und übersteht den Rundweg", () => {
    expect(toStoredSavingsPlans([])).toBeNull();
    const stored = toStoredSavingsPlans([plan({ securityId: SECURITY })]);
    expect(parseSavingsPlans(stored)[0].amount.toStringValue()).toBe("100.00");
  });
});

describe("monthlyAmount", () => {
  it("rechnet wöchentliche Raten mit 52 Wochen auf den Monat", () => {
    const weekly = plan({ amount: Money.fromString("30", EUR), interval: "weekly" });
    expect(monthlyAmount(weekly).toFixed(2)).toBe("130.00");
    expect(monthlyAmount(plan()).toFixed(2)).toBe("100.00");
  });

  it("summiert nur aktive Pläne", () => {
    const total = activeMonthlyTotal([
      plan(),
      plan({ amount: Money.fromString("30", EUR), interval: "weekly" }),
      plan({ paused: true }),
    ]);
    expect(total.toFixed(2)).toBe("230.00");
  });
});

describe("nextExecution", () => {
  it("lässt ein künftiges Datum stehen", () => {
    expect(nextExecution(plan({ nextDate: "2026-11-02" }), TODAY)).toBe("2026-11-02");
  });

  it("schreibt monatlich fort und kürzt am Monatsende", () => {
    expect(nextExecution(plan({ nextDate: "2026-08-02" }), TODAY)).toBe("2026-11-02");
    expect(
      nextExecution(plan({ nextDate: "2026-01-31" }), { ...TODAY, month: 2, day: 15 }),
    ).toBe("2026-02-28");
    expect(nextExecution(plan({ nextDate: "2026-10-25" }), TODAY)).toBe("2026-10-25");
  });

  it("schreibt wöchentlich in 7-Tage-Schritten fort", () => {
    const weekly = plan({ interval: "weekly", nextDate: "2026-10-01" });
    expect(nextExecution(weekly, TODAY)).toBe("2026-10-29");
  });

  it("nennt ohne Anker kein Datum", () => {
    expect(nextExecution(plan(), TODAY)).toBeNull();
  });
});

describe("savingsPlanOverview", () => {
  it("rechnet zwölf Raten mit dem Ertrag der Prognose", () => {
    const result = overview([
      plan(),
      plan({
        id: "plan2",
        securityId: "sec-c",
        amount: Money.fromString("30", EUR),
        interval: "weekly",
      }),
    ]);
    // Alpha: 1.200 € × 4 % = 48 €; Gamma: 1.560 € × 3 % = 46,80 €.
    expect(result.annual.toStringValue()).toBe("94.80");
    expect(result.monthly.toStringValue()).toBe("230.00");
    expect(result.yearly.toStringValue()).toBe("2760.00");
    expect(result.yieldPercent?.toFixed(2)).toBe("3.43");
    // Alphabetisch: Alpha vor Gamma.
    expect(result.rows.map((row) => row.plan.id)).toEqual(["plan1", "plan2"]);
    // Hochlauf: Im Oktober (12. Monat) zahlt Alpha mit allen zwölf Raten 12 €
    // mehr, Gamma 3,90 €; im Januar (3. Monat) erst drei Zwölftel davon (3,975 € auf Cent).
    const months = forecast().months;
    const delta = (month: number) => {
      const index = months.findIndex((entry) => entry.month === month);
      return result.after[index].subtract(result.before[index]).toDecimal().toFixed(3);
    };
    expect(delta(10)).toBe("15.900");
    expect(delta(1)).toBe("3.980");
  });

  it("zählt Pläne ohne Ausschüttung nur in der Summe, pausierte gar nicht", () => {
    const result = overview([
      plan({ securityId: "sec-unbekannt" }),
      plan({ id: "plan2", paused: true }),
    ]);
    expect(result.rows[0].annual).toBeNull();
    expect(result.paused[0].annual?.toStringValue()).toBe("48.00");
    expect(result.monthly.toStringValue()).toBe("100.00");
    expect(result.annual.toStringValue()).toBe("0.00");
  });

  it("nennt ohne aktive Pläne keinen Ertrag", () => {
    expect(overview([plan({ paused: true })]).yieldPercent).toBeNull();
  });
});
