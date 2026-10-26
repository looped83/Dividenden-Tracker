import { describe, expect, it } from "vitest";
import { EUR, Money, MoneyDecimal } from "@/lib/money";
import type { ForecastMonth, TwelveMonthForecast } from "@/features/securities/forecast";
import { purchaseForGap } from "@/features/planner/purchase";

const eur = (value: string) => Money.fromString(value, EUR);
const TODAY = { year: 2026, month: 10, day: 26 };

function month(
  year: number,
  number: number,
  items: [string, string, string][],
): ForecastMonth {
  return {
    year,
    month: number,
    total: eur("0"),
    contributions: items.map(([securityId, amount, marketValue]) => ({
      securityId,
      name: securityId.toUpperCase(),
      amount: eur(amount),
      payouts: 4,
      marketValue: eur(marketValue),
    })),
  };
}

// A zahlt im November und Dezember je 1 % des Marktwerts, B nur im Dezember 3 %.
const FORECAST = {
  months: [
    month(2026, 11, [["a", "10", "1000"]]),
    month(2026, 12, [
      ["a", "10", "1000"],
      ["b", "30", "1000"],
    ]),
    month(2027, 1, [["a", "10", "1000"]]),
  ],
} as unknown as TwelveMonthForecast;

const base = {
  forecast: FORECAST,
  excluded: new Set<string>(),
  year: 2026,
  gap: new MoneyDecimal(60),
  today: TODAY,
  max: 1_000_000,
};

describe("purchaseForGap", () => {
  it("zählt erst ab dem übernächsten Monat und nimmt den kleinsten Zukauf", () => {
    // November zählt nicht: A bringt bis Jahresende 1 %, B 3 % → 2.000 € in B.
    expect(purchaseForGap({ ...base, month: null })).toEqual({
      securityId: "b",
      name: "B",
      amount: 2000,
      until: 12,
    });
  });

  it("rundet auf volle 100 € auf und lässt ausgeschlossene Assets weg", () => {
    expect(
      purchaseForGap({
        ...base,
        month: 12,
        gap: new MoneyDecimal(61),
        excluded: new Set(["b"]),
      })?.amount,
    ).toBe(6100);
  });

  it("schlägt nichts vor, wenn im Zeitraum niemand mehr zahlt", () => {
    expect(purchaseForGap({ ...base, month: 11 })).toBeNull();
    expect(purchaseForGap({ ...base, month: null, max: 1000 })).toBeNull();
  });
});
