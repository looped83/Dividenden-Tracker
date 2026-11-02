import { describe, expect, it } from "vitest";
import { bonusValue } from "@/features/challenge/bonusValue";
import { DEFAULT_SNOWBALL_SETTINGS } from "@/features/securities/snowball";
import { MoneyDecimal } from "@/lib/money";

const depot = {
  annualGross: new MoneyDecimal(5000),
  growthPercent: new MoneyDecimal(6),
  yieldPercent: new MoneyDecimal(4),
  reinvestShare: new MoneyDecimal(0),
};

describe("bonusValue", () => {
  it("rechnet 100 € mit Rendite, Netto-Quote und Wachstum des Schneeballs", () => {
    const value = bonusValue({
      amount: 100,
      depot,
      settings: { ...DEFAULT_SNOWBALL_SETTINGS, inflationPercent: 0, reinvestPercent: 0 },
      ratio: new MoneyDecimal("0.75"),
      today: { year: 2026, month: 12, day: 1 },
    });
    // 100 € × 4 % × 0,75 = 3 € netto im Jahr.
    expect(value.today.toNumber()).toBeCloseTo(3);
    // Ohne Reinvestition und Inflation: 3 € × 1,06^n.
    expect(value.later.map((point) => point.years)).toEqual([10, 20]);
    expect(value.later[0]?.annual.toNumber()).toBeCloseTo(3 * 1.06 ** 10, 2);
    expect(value.later[1]?.annual.toNumber()).toBeCloseTo(3 * 1.06 ** 20, 2);
  });

  it("nimmt eine eigene Rendite aus den Annahmen", () => {
    const value = bonusValue({
      amount: 300,
      depot,
      settings: { ...DEFAULT_SNOWBALL_SETTINGS, yieldPercent: 5 },
      ratio: null,
      today: { year: 2026, month: 11, day: 2 },
    });
    expect(value.today.toNumber()).toBeCloseTo(15);
    expect(value.yieldPercent.toNumber()).toBe(5);
  });
});
