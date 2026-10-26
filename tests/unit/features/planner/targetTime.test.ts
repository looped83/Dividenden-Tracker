import { describe, expect, it } from "vitest";
import { DEFAULT_FORECAST_SETTINGS } from "@/features/securities/forecastSettings";
import { formatMonths, withPlanSavings } from "@/features/planner/targetTime";

describe("formatMonths", () => {
  it("nennt Monate, Jahre und beides", () => {
    expect(formatMonths(1)).toBe("1 Monat");
    expect(formatMonths(4)).toBe("4 Monate");
    expect(formatMonths(12)).toBe("1 Jahr");
    expect(formatMonths(27)).toBe("2 Jahre 3 Monate");
    expect(formatMonths(26.6)).toBe("2 Jahre 3 Monate");
  });

  it("nennt unter einem Monat Wochen oder Tage", () => {
    expect(formatMonths(0.5)).toBe("2 Wochen");
    expect(formatMonths(0.2)).toBe("1 Woche");
    expect(formatMonths(0.1)).toBe("3 Tage");
    expect(formatMonths(12 / 365)).toBe("1 Tag");
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
