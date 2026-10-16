import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";
import { buildHeroSeries } from "@/features/dashboard/heroSeries";

const TODAY: RefDate = { year: 2026, month: 7, day: 20 };

let seq = 0;
function payment(payDate: string, net: string): AnalyticsPayment {
  seq += 1;
  return {
    id: `id-${String(seq)}`,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: "sec-a",
    depotId: "dep-1",
    paymentType: "regular",
    source: "manual",
    createdAt: `${payDate}T10:00:00Z`,
  };
}

const PAYMENTS = [
  payment("2024-06-10", "50.00"),
  payment("2025-02-10", "30.00"),
  payment("2025-07-25", "70.00"), // nach dem 20. Juli: nicht im Vorjahr bis heute
  payment("2026-02-10", "40.00"),
  payment("2026-07-10", "60.00"),
];

describe("buildHeroSeries", () => {
  it("endet kumuliert im laufenden Jahr heute, mit dem Vorjahr bis zum gleichen Tag", () => {
    const series = buildHeroSeries(PAYMENTS, 2026, TODAY, "cumulative");
    if (series.kind !== "cumulative") throw new Error("falsche Sicht");
    // Jahresbeginn, sechs volle Monate, heute.
    expect(series.line).toHaveLength(8);
    const last = series.points[series.points.length - 1];
    expect(last.label).toBe("bis 20. Juli 2026");
    expect(last.value.toStringValue()).toBe("100.00");
    expect(last.prior?.toStringValue()).toBe("30.00");
    expect(last.x).toBeCloseTo(6 + 20 / 31);
    // Die Vorjahreslinie läuft über das ganze Jahr.
    expect(series.priorLine[12].toStringValue()).toBe("100.00");
  });

  it("zeigt ein abgeschlossenes Jahr kumuliert bis Dezember", () => {
    const series = buildHeroSeries(PAYMENTS, 2025, TODAY, "cumulative");
    expect(series.points).toHaveLength(12);
    expect(series.points[11].label).toBe("bis Dezember 2025");
    expect(series.points[11].prior?.toStringValue()).toBe("50.00");
  });

  it("lässt monatlich die Monate ohne Beginn weg", () => {
    const series = buildHeroSeries(PAYMENTS, 2026, TODAY, "monthly");
    expect(series.points.map((p) => p.label)).toEqual([
      "Januar 2026",
      "Februar 2026",
      "März 2026",
      "April 2026",
      "Mai 2026",
      "Juni 2026",
      "Juli 2026",
    ]);
    expect(series.points[1].href).toBe("/eingaenge?year=2026&month=2");
  });

  it("vergleicht bei „Alle Jahre“ das laufende Jahr mit dem Vorjahr bis heute", () => {
    const series = buildHeroSeries(PAYMENTS, "all", TODAY, "cumulative");
    expect(series.kind).toBe("years");
    const current = series.points[series.points.length - 1];
    expect(current.label).toBe("2026 bis heute");
    expect(current.prior?.toStringValue()).toBe("30.00");
    // Das erste Jahr hat keinen Vergleich.
    expect(series.points[0].prior).toBeNull();
    expect(series.points[1].prior?.toStringValue()).toBe("50.00");
  });
});
