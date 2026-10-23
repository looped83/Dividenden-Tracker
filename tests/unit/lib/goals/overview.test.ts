import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";
import {
  annualGoalHistory,
  annualHitRate,
  recentAnnualGrowth,
  suggestAnnualGoal,
  trailingMonthlyAverage,
  type Goal,
} from "@/lib/goals";

let seq = 0;
function payment(payDate: string, net: string): AnalyticsPayment {
  seq += 1;
  return {
    id: `p${String(seq)}`,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: "sec",
    depotId: "dep",
    paymentType: "regular",
    source: "manual",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function goal(year: number, target: string, month: number | null = null): Goal {
  return {
    id: `g-${String(year)}-${String(month)}`,
    goalType: month === null ? "annual" : "monthly",
    year,
    month,
    targetAmount: Money.fromString(target, EUR),
    currency: "EUR",
    title: null,
    note: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const OCT_2026: RefDate = { year: 2026, month: 10, day: 23 };
const MAY_2026: RefDate = { year: 2026, month: 5, day: 1 };
const eur = (value: string) => Money.fromString(value, EUR);

const PAYMENTS = [
  payment("2022-06-01", "1000"),
  payment("2023-06-01", "1200"),
  payment("2024-06-01", "1300"),
  payment("2025-06-01", "1331"),
  payment("2026-03-01", "1200"),
];

describe("annualGoalHistory / annualHitRate", () => {
  it("nimmt nur Jahresziele, das älteste zuerst, und zählt nur beendete Jahre", () => {
    const goals = [
      goal(2026, "2000"),
      goal(2024, "1500"),
      goal(2026, "500", 3),
      goal(2025, "1000"),
    ];
    const history = annualGoalHistory(goals, PAYMENTS, OCT_2026);
    expect(history.map((p) => p.goal.year)).toEqual([2024, 2025, 2026]);
    // 2024 verfehlt, 2025 übertroffen, 2026 läuft noch.
    expect(annualHitRate(history)).toEqual({ hit: 1, total: 2 });
  });
});

describe("trailingMonthlyAverage", () => {
  it("teilt die letzten zwölf Monate durch zwölf", () => {
    const avg = trailingMonthlyAverage(
      [
        payment("2025-10-23", "999"),
        payment("2025-11-01", "600"),
        payment("2026-10-01", "600"),
      ],
      OCT_2026,
    );
    expect(avg.toStringValue()).toBe("100.00");
  });
});

describe("recentAnnualGrowth", () => {
  it("rechnet die CAGR der letzten drei vollen Jahre", () => {
    const result = recentAnnualGrowth(PAYMENTS, OCT_2026);
    expect(result?.from).toBe(2022);
    expect(result?.to).toBe(2025);
    // 1000 → 1331 in drei Jahren = 10 % p. a.
    expect(result?.growth.toNumber()).toBeCloseTo(0.1, 6);
  });

  it("ist ohne Startjahr null und deckelt bei 30 %", () => {
    expect(recentAnnualGrowth([payment("2025-01-01", "10")], OCT_2026)).toBeNull();
    const steep = recentAnnualGrowth(
      [payment("2022-01-01", "1"), payment("2025-01-01", "1000")],
      OCT_2026,
    );
    expect(steep?.growth.toNumber()).toBe(0.3);
  });
});

describe("suggestAnnualGoal", () => {
  it("schlägt fürs laufende Jahr ohne Ziel die Prognose vor, gerundet auf 100 €", () => {
    const suggestion = suggestAnnualGoal([], PAYMENTS, MAY_2026, eur("1449.99"));
    expect(suggestion?.year).toBe(2026);
    expect(suggestion?.amount.toStringValue()).toBe("1400.00");
    expect(suggestion?.growth).toBeNull();
  });

  it("schlägt das nächste Jahr erst ab Oktober vor: Prognose plus Wachstum", () => {
    const goals = [goal(2026, "2000")];
    expect(suggestAnnualGoal(goals, PAYMENTS, MAY_2026, eur("2000"))).toBeNull();
    const suggestion = suggestAnnualGoal(goals, PAYMENTS, OCT_2026, eur("2000"));
    expect(suggestion?.year).toBe(2027);
    expect(suggestion?.amount.toStringValue()).toBe("2200.00");
  });

  it("schweigt, wenn beide Jahre ein Ziel haben", () => {
    const goals = [goal(2026, "2000"), goal(2027, "2500")];
    expect(suggestAnnualGoal(goals, PAYMENTS, OCT_2026, eur("2000"))).toBeNull();
  });
});
