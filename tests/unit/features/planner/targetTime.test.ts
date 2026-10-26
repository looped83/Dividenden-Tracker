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
  it("nimmt ohne eigene Sparrate die Sparpläne", () => {
    const result = withPlanSavings(
      { ...DEFAULT_FORECAST_SETTINGS, monthlySavings: 0 },
      800,
    );
    expect(result.fromPlans).toBe(true);
    expect(result.settings.monthlySavings).toBe(800);
  });

  it("lässt eine eigene Sparrate stehen", () => {
    const result = withPlanSavings(
      { ...DEFAULT_FORECAST_SETTINGS, monthlySavings: 500 },
      800,
    );
    expect(result.fromPlans).toBe(false);
    expect(result.settings.monthlySavings).toBe(500);
  });
});
