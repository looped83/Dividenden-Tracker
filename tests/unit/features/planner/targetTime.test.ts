import { describe, expect, it } from "vitest";
import { DEFAULT_FORECAST_SETTINGS } from "@/features/securities/forecastSettings";
import { formatMonths, withPlanSavings } from "@/features/planner/targetTime";

describe("formatMonths", () => {
  it("nennt Monate, Jahre und beides", () => {
    expect(formatMonths(1)).toBe("1 Monat");
    expect(formatMonths(4)).toBe("4 Monate");
    expect(formatMonths(12)).toBe("1 Jahr");
    expect(formatMonths(27)).toBe("2 Jahre 3 Monate");
  });
});

describe("withPlanSavings", () => {
  it("rechnet die Sparpläne zu den Einmalkäufen hinzu", () => {
    const settings = withPlanSavings(
      { ...DEFAULT_FORECAST_SETTINGS, monthlySavings: 3000 },
      800,
    );
    expect(settings.monthlySavings).toBe(3800);
  });

  it("lässt die Annahmen ohne Pläne unverändert", () => {
    const stored = { ...DEFAULT_FORECAST_SETTINGS, monthlySavings: 500 };
    expect(withPlanSavings(stored, 0)).toBe(stored);
  });
});
