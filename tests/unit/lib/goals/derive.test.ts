import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { RefDate } from "@/lib/statistics";
import { deriveMonthlyGoals, type Goal } from "@/lib/goals";

const eur = (value: string) => Money.fromString(value, EUR);
const OCT_2026: RefDate = { year: 2026, month: 10, day: 26 };

function goal(year: number, target: string, month: number | null = null): Goal {
  return {
    id: `g-${String(year)}-${String(month)}`,
    goalType: month === null ? "annual" : "monthly",
    year,
    month,
    targetAmount: eur(target),
    currency: "EUR",
    title: null,
    note: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

/** Jan–Sep je 100 € erhalten. */
const RECEIVED = Array.from({ length: 12 }, (_, index) => eur(index < 9 ? "100" : "0"));
/** Erwartet: Okt 100, Nov 300, Dez 100. */
const PATTERN = RECEIVED.map((value, index) =>
  index === 9
    ? eur("100")
    : index === 10
      ? eur("300")
      : index === 11
        ? eur("100")
        : value,
);

describe("deriveMonthlyGoals", () => {
  it("verteilt den Rest des laufenden Jahres nach dem erwarteten Muster", () => {
    const result = deriveMonthlyGoals({
      annual: goal(2026, "1500"),
      goals: [],
      pattern: PATTERN,
      received: RECEIVED,
      ref: OCT_2026,
    });

    // 1.500 − 900 erhalten = 600, im Verhältnis 1 : 3 : 1.
    expect(result.map((item) => [item.month, item.amount.toStringValue()])).toEqual([
      [10, "120.00"],
      [11, "360.00"],
      [12, "120.00"],
    ]);
  });

  it("zieht vorhandene Monatsziele ab und lässt ihre Monate aus", () => {
    const result = deriveMonthlyGoals({
      annual: goal(2026, "1500"),
      goals: [goal(2026, "400", 11)],
      pattern: PATTERN,
      received: RECEIVED,
      ref: OCT_2026,
    });

    expect(result.map((item) => [item.month, item.amount.toStringValue()])).toEqual([
      [10, "100.00"],
      [12, "100.00"],
    ]);
  });

  it("rundet auf volle Euro und trifft die Summe genau", () => {
    const result = deriveMonthlyGoals({
      annual: goal(2026, "1000.50"),
      goals: [],
      pattern: PATTERN,
      received: RECEIVED,
      ref: OCT_2026,
    });

    // 100,50 € fehlen → 101 €, verteilt 20,2 : 60,6 : 20,2.
    const amounts = result.map((item) => item.amount.toStringValue());
    expect(amounts).toEqual(["20.00", "61.00", "20.00"]);
  });

  it("verteilt ein späteres Jahr über alle Monate mit Erwartung", () => {
    const result = deriveMonthlyGoals({
      annual: goal(2027, "1400"),
      goals: [],
      pattern: PATTERN,
      received: RECEIVED,
      ref: OCT_2026,
    });

    expect(result).toHaveLength(12);
    expect(result[10].amount.toStringValue()).toBe("300.00");
  });

  it("bleibt leer, wenn nichts mehr fehlt oder das Jahr vorbei ist", () => {
    const base = { goals: [], pattern: PATTERN, received: RECEIVED, ref: OCT_2026 };
    expect(deriveMonthlyGoals({ ...base, annual: goal(2026, "900") })).toEqual([]);
    expect(deriveMonthlyGoals({ ...base, annual: goal(2025, "5000") })).toEqual([]);
  });
});
