import { describe, expect, it } from "vitest";
import { MoneyDecimal } from "@/lib/money";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import {
  DEFAULT_SNOWBALL_SETTINGS,
  depotAssumptions,
  projectSnowball,
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
});

describe("parseSnowballSettings", () => {
  it("faellt je Feld auf die Vorbelegung zurueck", () => {
    expect(
      parseSnowballSettings({
        monthlySavings: 250,
        targetMonthly: "viel",
        birthYear: 1983,
      }),
    ).toEqual({
      ...DEFAULT_SNOWBALL_SETTINGS,
      monthlySavings: 250,
      birthYear: 1983,
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
