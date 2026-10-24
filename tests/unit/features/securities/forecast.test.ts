import { describe, expect, it } from "vitest";
import { EUR, Money, formatPercent } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics/types";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import {
  forecastTwelveMonths,
  forecastWindow,
  monthGaps,
  netRatio,
  payoutMonthsOf,
  type ForecastFacets,
  type TwelveMonthForecast,
} from "@/features/securities/forecast";

const TODAY = { year: 2026, month: 10, day: 21 };

let counter = 0;
function snapshot(partial: Partial<SecuritySnapshot> = {}): SecuritySnapshot {
  counter += 1;
  return {
    id: `snap-${String(counter)}`,
    user_id: "user-1",
    security_id: "sec-a",
    run_id: "run-1",
    as_of: "2026-10-15",
    quantity: "10.000000",
    buyin_per_share: null,
    buyin_total: "1000.00",
    price: null,
    market_value: "1200.00",
    gain_absolute: null,
    gain_relative: null,
    allocation: null,
    dividend_yield: null,
    dividend_yield_on_buyin: null,
    annual_dividend_total: "120.00",
    dividend_per_share: null,
    dividend_frequency: "quarterly",
    dividend_cagr: null,
    dividend_cagr_period: null,
    next_ex_date: null,
    next_pay_date: null,
    asset_type: "equity",
    currency: "EUR",
    created_at: "2026-10-15T10:00:00Z",
    ...partial,
  };
}

function payment(
  securityId: string,
  date: string,
  net: string,
  gross: string,
): AnalyticsPayment {
  counter += 1;
  return {
    id: `pay-${String(counter)}`,
    payDate: date,
    actualPayDate: date,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(gross, EUR),
    securityId,
    depotId: "depot-1",
    paymentType: "regular",
    source: "manual",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const FACETS = new Map<string, ForecastFacets>([
  ["sec-a", { name: "Alpha", payoutMonths: [1, 4, 7, 10] }],
  ["sec-b", { name: "Beta", payoutMonths: [] }],
]);

function run(
  input: Partial<Parameters<typeof forecastTwelveMonths>[0]>,
): TwelveMonthForecast {
  const result = forecastTwelveMonths({
    snapshots: [snapshot()],
    facets: FACETS,
    payments: [],
    today: TODAY,
    ...input,
  });
  if (result.kind !== "ok") throw new Error(`unerwartet: ${result.kind}`);
  return result.forecast;
}

function monthTotal(forecast: TwelveMonthForecast, year: number, month: number): string {
  const found = forecast.months.find((m) => m.year === year && m.month === month);
  return found?.total.toStringValue() ?? "missing";
}

describe("forecastWindow", () => {
  it("nimmt die zwoelf vollen Monate nach dem laufenden, ueber den Jahreswechsel", () => {
    const window = forecastWindow(TODAY);
    expect(window).toHaveLength(12);
    expect(window[0]).toEqual({ year: 2026, month: 11 });
    expect(window[2]).toEqual({ year: 2027, month: 1 });
    expect(window[11]).toEqual({ year: 2027, month: 10 });
  });

  it("beginnt im Dezember mit dem Januar des Folgejahres", () => {
    expect(forecastWindow({ year: 2026, month: 12, day: 3 })[0]).toEqual({
      year: 2027,
      month: 1,
    });
  });
});

describe("netRatio", () => {
  it("teilt netto durch brutto der zwoelf Monate bis heute", () => {
    const ratio = netRatio(
      [
        payment("sec-a", "2026-04-10", "75.00", "100.00"),
        payment("sec-a", "2026-07-10", "75.00", "100.00"),
        // Ausserhalb des Fensters: zaehlt nicht.
        payment("sec-a", "2024-07-10", "10.00", "100.00"),
      ],
      "2026-10-21",
    );
    expect(ratio && formatPercent(ratio.times(100), 0)).toBe("75 %");
  });

  it("ist ohne Zahlungen unbekannt", () => {
    expect(netRatio([], "2026-10-21")).toBeNull();
  });

  it("liegt nie ueber 1", () => {
    const ratio = netRatio(
      [payment("sec-a", "2026-04-10", "120.00", "100.00")],
      "2026-10-21",
    );
    expect(ratio?.toString()).toBe("1");
  });
});

describe("payoutMonthsOf", () => {
  it("nimmt gepflegte Monate vor allem anderen", () => {
    expect(
      payoutMonthsOf(
        FACETS.get("sec-a"),
        new Set([2]),
        snapshot({ next_pay_date: "2026-12-01" }),
      ),
    ).toEqual([1, 4, 7, 10]);
  });

  it("nimmt sonst die Monate der letzten Zahlungen", () => {
    expect(payoutMonthsOf(FACETS.get("sec-b"), new Set([6, 3]), snapshot())).toEqual([
      3, 6,
    ]);
  });

  it("leitet sonst aus Rhythmus und naechstem Zahltag ab", () => {
    expect(
      payoutMonthsOf(
        FACETS.get("sec-b"),
        undefined,
        snapshot({ dividend_frequency: "biannually", next_pay_date: "2026-11-20" }),
      ),
    ).toEqual([5, 11]);
  });

  it("verteilt ohne jede Angabe auf alle Monate", () => {
    expect(
      payoutMonthsOf(
        FACETS.get("sec-b"),
        undefined,
        snapshot({ dividend_frequency: "irregular" }),
      ),
    ).toHaveLength(12);
  });
});

describe("forecastTwelveMonths", () => {
  it("verteilt die Jahresdividende auf die Zahlmonate und rechnet mit der Netto-Quote", () => {
    const forecast = run({
      payments: [payment("sec-a", "2026-07-10", "22.50", "30.00")],
    });
    // 120 € brutto × 0,75 ÷ 4 Zahlungen = 22,50 € je Quartal
    expect(monthTotal(forecast, 2027, 1)).toBe("22.50");
    expect(monthTotal(forecast, 2026, 11)).toBe("0.00");
    expect(forecast.total.toStringValue()).toBe("90.00");
    expect(forecast.receivedLast12.toStringValue()).toBe("22.50");
  });

  it("zaehlt Positionen ohne Jahresdividende und laesst Nicht-Zahler aus", () => {
    const forecast = run({
      snapshots: [
        snapshot(),
        snapshot({ security_id: "sec-b", annual_dividend_total: null }),
        snapshot({ security_id: "sec-c", dividend_frequency: "none" }),
      ],
    });
    expect(forecast.withoutAmount).toBe(1);
    expect(forecast.total.toStringValue()).toBe("120.00");
  });

  it("liest nur den juengsten Stand", () => {
    const forecast = run({
      snapshots: [
        snapshot({ as_of: "2026-01-01", annual_dividend_total: "999.00" }),
        snapshot(),
      ],
    });
    expect(forecast.total.toStringValue()).toBe("120.00");
  });

  it("meldet einen fehlenden Stand und fremde Waehrungen", () => {
    const base = {
      facets: FACETS,
      payments: [],
      today: TODAY,
    };
    expect(forecastTwelveMonths({ ...base, snapshots: [] }).kind).toBe("empty");
    expect(
      forecastTwelveMonths({ ...base, snapshots: [snapshot({ currency: "USD" })] }).kind,
    ).toBe("mixedCurrency");
  });
});

describe("monthGaps", () => {
  const facets = new Map<string, ForecastFacets>([
    ...FACETS,
    ["sec-c", { name: "Gamma", payoutMonths: [3] }],
    ["sec-d", { name: "Delta", payoutMonths: [3, 9] }],
  ]);
  // Alpha 30 € je Quartal, Beta 10 € jeden Monat, Gamma 6 € im März,
  // Delta je 3 € im März und September: 252 € im Jahr, Ø 21 €.
  const forecast = run({
    facets,
    snapshots: [
      snapshot(),
      snapshot({ security_id: "sec-b" }),
      snapshot({
        security_id: "sec-c",
        annual_dividend_total: "6.00",
        market_value: "600.00",
      }),
      snapshot({
        security_id: "sec-d",
        annual_dividend_total: "6.00",
        market_value: "900.00",
      }),
    ],
  });
  const { average, gaps } = monthGaps(forecast);
  const gapOf = (year: number, month: number) =>
    gaps.find((gap) => gap.year === year && gap.month === month);

  it("nennt die Monate unter dem Ø in der Reihenfolge der Prognose", () => {
    expect(average.toStringValue()).toBe("21.00");
    expect(gaps.map((gap) => gap.month)).toEqual([11, 12, 2, 3, 5, 6, 8, 9]);
    expect(gapOf(2027, 3)?.gap.toStringValue()).toBe("2.00");
  });

  it("wählt den Füller mit dem kleinsten Zukauf, nie einen Monatszahler", () => {
    // Gamma: 2 € × 600 € ÷ 6 € = 200 €; Delta: 2 € × 900 € ÷ 3 € = 600 €
    expect(gapOf(2027, 3)?.filler).toMatchObject({ name: "Gamma", payouts: 1 });
    expect(gapOf(2027, 3)?.filler?.invest.toStringValue()).toBe("200.00");
    // 1.000 € × 6 € ÷ 600 € = 10 € mehr im März
    expect(gapOf(2027, 3)?.filler?.perThousand.toStringValue()).toBe("10.00");
    // 8 € × 900 € ÷ 3 € = 2.400 €
    expect(gapOf(2027, 9)?.filler?.invest.toStringValue()).toBe("2400.00");
    // Nur Beta zahlt im November — monatlich, also kein Füller.
    expect(gapOf(2026, 11)?.filler).toBeNull();
  });
});
