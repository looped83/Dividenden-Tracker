import { describe, expect, it } from "vitest";
import { EUR, Money, MoneyDecimal } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import {
  DEFAULT_SNOWBALL_SETTINGS,
  depotAssumptions,
  monthsEarlier,
  monthsToTarget,
  projectSnowball,
  snowballHistory,
  type DepotAssumptions,
  type SnowballSettings,
} from "@/features/securities/snowball";
import {
  parseGermanNumber,
  parseSnowballSettings,
} from "@/features/securities/forecastSettings";

function snapshot(partial: Partial<SecuritySnapshot>): SecuritySnapshot {
  return {
    id: "snap",
    user_id: "user-1",
    security_id: "sec-a",
    run_id: "run-1",
    as_of: "2026-10-15",
    quantity: "10.000000",
    buyin_per_share: null,
    buyin_total: null,
    price: null,
    market_value: "1000.00",
    gain_absolute: null,
    gain_relative: null,
    allocation: null,
    dividend_yield: null,
    dividend_yield_on_buyin: null,
    annual_dividend_total: "30.00",
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

const DEPOT: DepotAssumptions = {
  annualGross: new MoneyDecimal(1200),
  growthPercent: new MoneyDecimal(0),
  yieldPercent: new MoneyDecimal(3),
};

function settings(partial: Partial<SnowballSettings>): SnowballSettings {
  return {
    ...DEFAULT_SNOWBALL_SETTINGS,
    inflationPercent: 0,
    growthPercent: 0,
    ...partial,
  };
}

describe("depotAssumptions", () => {
  it("gewichtet die CAGR mit der Jahresdividende und deckelt Ausreisser", () => {
    const result = depotAssumptions([
      snapshot({
        security_id: "a",
        annual_dividend_total: "90.00",
        dividend_cagr: "0.04",
      }),
      snapshot({
        security_id: "b",
        annual_dividend_total: "10.00",
        dividend_cagr: "0.24",
      }),
      snapshot({
        security_id: "c",
        annual_dividend_total: "0.00",
        dividend_cagr: "0.90",
      }),
    ]);
    // (0,04 × 90 + 0,24 × 10) ÷ 100 = 6 %
    expect(result?.growthPercent.toString()).toBe("6");
    expect(result?.annualGross.toString()).toBe("100");
    // 100 € ÷ 3000 € = 3,33 %
    expect(result?.yieldPercent.toDecimalPlaces(2).toString()).toBe("3.33");
  });

  it("faellt ohne CAGR und Marktwert auf feste Werte zurueck", () => {
    const result = depotAssumptions([snapshot({ market_value: null })]);
    expect(result?.growthPercent.toString()).toBe("5");
    expect(result?.yieldPercent.toString()).toBe("3");
  });

  it("deckelt das Wachstum bei 8 %", () => {
    const result = depotAssumptions([snapshot({ dividend_cagr: "0.25" })]);
    expect(result?.growthPercent.toString()).toBe("8");
  });

  it("ist ohne Stand unbekannt", () => {
    expect(depotAssumptions([])).toBeNull();
  });
});

describe("projectSnowball", () => {
  it("startet heute mit der monatlichen Nettodividende des Depots", () => {
    const result = projectSnowball({
      depot: DEPOT,
      settings: settings({}),
      netRatio: new MoneyDecimal("0.75"),
      startYear: 2026,
    });
    expect(result.points).toHaveLength(31);
    expect(result.points[0]).toMatchObject({ year: 2026 });
    // 1200 € × 0,75 ÷ 12
    expect(result.points[0].base.toString()).toBe("75");
  });

  it("bleibt ohne Sparrate, Reinvestition und Wachstum stehen", () => {
    const result = projectSnowball({
      depot: DEPOT,
      settings: settings({ reinvest: false }),
      netRatio: null,
      startYear: 2026,
    });
    expect(result.points[30].base.toString()).toBe("100");
    expect(result.targetYear).toBeNull();
  });

  it("baut mit der Sparrate Dividende auf", () => {
    const result = projectSnowball({
      depot: DEPOT,
      settings: settings({ reinvest: false, monthlySavings: 100 }),
      netRatio: null,
      startYear: 2026,
    });
    // 12 × 100 € × 3 % = 36 € mehr Jahresdividende = 3 € mehr im Monat
    expect(result.points[1].base.toString()).toBe("103");
  });

  it("waechst mit Dividendenwachstum am Jahresende", () => {
    const result = projectSnowball({
      depot: DEPOT,
      settings: settings({ reinvest: false, growthPercent: 10 }),
      netRatio: null,
      startYear: 2026,
    });
    expect(result.points[1].base.toString()).toBe("110");
    expect(result.points[2].base.toString()).toBe("121");
  });

  it("rechnet mit Inflation in heutige Kaufkraft um", () => {
    const result = projectSnowball({
      depot: DEPOT,
      settings: settings({ reinvest: false, growthPercent: 10, inflationPercent: 10 }),
      netRatio: null,
      startYear: 2026,
    });
    expect(result.points[1].base.toString()).toBe("100");
  });

  it("findet das Zieljahr und spannt die Szenarien auf", () => {
    const result = projectSnowball({
      depot: DEPOT,
      settings: settings({ growthPercent: 5, monthlySavings: 500, targetMonthly: 1000 }),
      netRatio: new MoneyDecimal("0.8"),
      startYear: 2026,
    });
    expect(result.targetYear).not.toBeNull();
    expect(result.targetYearEarliest).not.toBeNull();
    expect(result.growthHighPercent.toString()).toBe("7");
    expect(result.growthLowPercent.toString()).toBe("3");
    const base = result.targetYear ?? 0;
    expect(result.targetYearEarliest ?? 0).toBeLessThanOrEqual(base);
    expect(result.targetYearLatest ?? Infinity).toBeGreaterThanOrEqual(base);
    expect(result.points[10].low.lessThanOrEqualTo(result.points[10].base)).toBe(true);
    expect(result.points[10].high.greaterThanOrEqualTo(result.points[10].base)).toBe(
      true,
    );
  });

  it("nennt Meilensteine zwischen heute und dem Ziel, das Ziel zuletzt", () => {
    const result = projectSnowball({
      depot: DEPOT,
      settings: settings({ growthPercent: 5, monthlySavings: 500, targetMonthly: 2000 }),
      netRatio: null,
      startYear: 2026,
    });
    const amounts = result.milestones.map((m) => m.amount);
    expect(amounts).toEqual([500, 1000, 1500, 2000]);
    expect(result.milestones.at(-1)?.isTarget).toBe(true);
    const years = result.milestones.map((m) => m.year ?? Infinity);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });

  it("nimmt das Wachstum aus dem Depot, wenn keines gesetzt ist", () => {
    const result = projectSnowball({
      depot: { ...DEPOT, growthPercent: new MoneyDecimal("4.5") },
      settings: settings({ growthPercent: null }),
      netRatio: null,
      startYear: 2026,
    });
    expect(result.growthPercent.toString()).toBe("4.5");
  });

  it("laesst das vorsichtige Wachstum nie unter 0 % fallen", () => {
    const result = projectSnowball({
      depot: DEPOT,
      settings: settings({ growthPercent: 1 }),
      netRatio: null,
      startYear: 2026,
    });
    expect(result.growthLowPercent.toString()).toBe("0");
  });
});

describe("parseSnowballSettings", () => {
  it("faellt je Feld auf die Vorbelegung zurueck", () => {
    expect(
      parseSnowballSettings({
        monthlySavings: 250,
        targetMonthly: "viel",
      }),
    ).toEqual({
      ...DEFAULT_SNOWBALL_SETTINGS,
      monthlySavings: 250,
    });
  });

  it("nimmt ohne gespeicherte Annahmen die Vorbelegung", () => {
    expect(parseSnowballSettings(null)).toEqual(DEFAULT_SNOWBALL_SETTINGS);
  });
});

describe("parseGermanNumber", () => {
  it.each([
    ["1.000", 1000],
    ["2,5", 2.5],
    ["1.234,5", 1234.5],
    ["250", 250],
    ["", null],
    ["abc", undefined],
    ["-5", undefined],
  ])("%s → %s", (raw, expected) => {
    expect(parseGermanNumber(raw)).toBe(expected);
  });
});

function payment(payDate: string, net: string): AnalyticsPayment {
  return {
    id: `p-${payDate}`,
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

describe("snowballHistory", () => {
  it("nimmt je abgeschlossenem Jahr die Nettodividende ÷ 12, Lücken mit 0", () => {
    const history = snowballHistory(
      [
        payment("2023-03-15", "600.00"),
        payment("2023-09-15", "600.00"),
        payment("2025-06-15", "2400.00"),
        payment("2026-06-15", "9999.00"),
      ],
      2026,
    );
    expect(history.map((point) => [point.year, point.monthly.toString()])).toEqual([
      [2023, "100"],
      [2024, "0"],
      [2025, "200"],
    ]);
  });

  it("ist ohne Zahlung vor dem laufenden Jahr leer", () => {
    expect(snowballHistory([payment("2026-02-01", "50.00")], 2026)).toEqual([]);
  });
});

describe("monthsToTarget / monthsEarlier", () => {
  // 1.200 € brutto, netto = brutto: heute 100 € im Monat. 1.000 € Sparrate
  // zu 3 % heben die Jahresdividende je Monat um 30 €, den Monat um 2,50 €.
  const plain = settings({ reinvest: false, monthlySavings: 1000, targetMonthly: 200 });

  it("zählt die Monate bis zum Ziel", () => {
    expect(monthsToTarget({ depot: DEPOT, settings: plain, netRatio: null })).toBe(40);
  });

  it("passt zum Zieljahr der Hochrechnung", () => {
    const busy = settings({ monthlySavings: 300, growthPercent: 5, inflationPercent: 2 });
    const months = monthsToTarget({ depot: DEPOT, settings: busy, netRatio: null });
    const { targetYear } = projectSnowball({
      depot: DEPOT,
      settings: busy,
      netRatio: null,
      startYear: 2026,
    });
    expect(months).not.toBeNull();
    expect(targetYear).not.toBeNull();
    expect(Math.ceil((months ?? 0) / 12)).toBe((targetYear ?? 0) - 2026);
  });

  it("zieht das Ziel mit einem Einmalkauf vor", () => {
    // +600 € im Jahr = +50 € im Monat: Es fehlen nur noch 50 €, also 20 Monate.
    expect(
      monthsEarlier({
        depot: DEPOT,
        settings: plain,
        netRatio: null,
        extraAnnualNet: new MoneyDecimal(600),
      }),
    ).toBe(20);
  });

  it("rechnet einen Einmalkauf über die Netto-Quote zurück", () => {
    // Netto-Quote 0,5: heute 50 €; +600 € netto heben auf 100 € = Ziel.
    expect(
      monthsToTarget({
        depot: DEPOT,
        settings: settings({ reinvest: false, targetMonthly: 100 }),
        netRatio: new MoneyDecimal("0.5"),
        extraAnnualNet: new MoneyDecimal(600),
      }),
    ).toBe(0);
  });

  it("zieht das Ziel mit zusätzlicher Sparrate vor", () => {
    // Doppelte Sparrate: 5 € je Monat, 20 statt 40 Monate.
    expect(
      monthsEarlier({
        depot: DEPOT,
        settings: plain,
        netRatio: null,
        extraSavings: 1000,
      }),
    ).toBe(20);
  });

  it("rechnet ohne den Zusatz über den Horizont hinaus", () => {
    // Ohne Sparrate 0,25 € mehr je Monat: 400 Monate (> 30 Jahre) bis 200 €.
    const slow = settings({ reinvest: false, monthlySavings: 100, targetMonthly: 200 });
    expect(monthsToTarget({ depot: DEPOT, settings: slow, netRatio: null })).toBeNull();
    expect(
      monthsEarlier({ depot: DEPOT, settings: slow, netRatio: null, extraSavings: 900 }),
    ).toBe(400 - 40);
  });

  it("nennt nichts, wenn das Ziel schon erreicht oder nicht absehbar ist", () => {
    const reached = settings({ targetMonthly: 50 });
    expect(monthsToTarget({ depot: DEPOT, settings: reached, netRatio: null })).toBe(0);
    expect(
      monthsEarlier({
        depot: DEPOT,
        settings: reached,
        netRatio: null,
        extraSavings: 100,
      }),
    ).toBeNull();
    const never = settings({ reinvest: false, targetMonthly: 1000 });
    expect(monthsToTarget({ depot: DEPOT, settings: never, netRatio: null })).toBeNull();
    expect(
      monthsEarlier({ depot: DEPOT, settings: never, netRatio: null, extraSavings: 10 }),
    ).toBeNull();
    expect(
      monthsToTarget({
        depot: DEPOT,
        settings: settings({ targetMonthly: 0 }),
        netRatio: null,
      }),
    ).toBeNull();
  });
});
