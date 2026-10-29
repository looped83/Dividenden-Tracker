import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import { milestoneOverview, yearMilestones } from "@/lib/progress";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";

let seq = 0;
function payment(payDate: string, net: string, securityId = "sec"): AnalyticsPayment {
  seq += 1;
  return {
    id: `p${String(seq)}`,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId,
    depotId: "dep",
    paymentType: "regular",
    source: "manual",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const TODAY: RefDate = { year: 2026, month: 4, day: 10 };

describe("milestoneOverview", () => {
  it("datiert jede Schwelle auf die Zahlung, mit der sie fiel", () => {
    const { reached } = milestoneOverview(
      [
        payment("2026-02-01", "600"),
        payment("2026-01-15", "60"),
        payment("2026-03-01", "500"),
      ],
      TODAY,
    );
    const find = (kind: string, threshold: number) =>
      reached.find((m) => m.kind === kind && m.threshold === threshold)?.reachedOn;

    expect(find("first", 0)).toBe("2026-01-15");
    expect(find("month", 100)).toBe("2026-02-01");
    expect(find("month", 500)).toBe("2026-02-01");
    expect(find("month", 750)).toBeUndefined();
    expect(find("year", 500)).toBe("2026-02-01");
    expect(find("year", 1000)).toBe("2026-03-01");
    expect(find("total", 1000)).toBe("2026-03-01");
    expect(find("streak", 3)).toBe("2026-03-01");
    // Neueste zuerst.
    expect(reached.at(-1)?.kind).toBe("first");
  });

  it("nennt je Art die nächste Schwelle mit dem heutigen Stand", () => {
    const { next } = milestoneOverview(
      [payment("2025-12-01", "900", "a"), payment("2026-01-05", "300", "b")],
      TODAY,
    );
    const byKind = (kind: string) => next.find((m) => m.kind === kind);

    expect(byKind("total")?.threshold).toBe(1500);
    expect(byKind("total")?.current.toFixed(0)).toBe("1200");
    expect(byKind("total")?.percent.toFixed(0)).toBe("80");
    expect(byKind("year")?.threshold).toBe(1000);
    expect(byKind("month")?.threshold).toBe(1000);
    expect(byKind("payers")).toBeUndefined();
  });

  it("zählt eine Serie nur, solange der Vormonat bezahlt hat", () => {
    const serie = [
      payment("2026-01-05", "10"),
      payment("2026-02-05", "10"),
      payment("2026-03-05", "10"),
    ];
    const laufend = milestoneOverview(serie, TODAY).next.find((m) => m.kind === "streak");
    expect(laufend?.current.toFixed(0)).toBe("3");
    expect(laufend?.threshold).toBe(6);

    const abgerissen = milestoneOverview(serie, {
      year: 2026,
      month: 6,
      day: 1,
    }).next.find((m) => m.kind === "streak");
    expect(abgerissen?.current.toFixed(0)).toBe("0");
  });

  it("setzt die Leitern über die Tabelle hinaus fort", () => {
    const { reached } = milestoneOverview([payment("2026-01-01", "120000")], TODAY);
    const total = reached.filter((m) => m.kind === "total").map((m) => m.threshold);
    expect(total).toEqual(
      [
        1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 30000, 40000,
        50000, 75000, 100000,
      ].reverse(),
    );
  });

  it("bleibt ohne Zahlungen leer", () => {
    const { reached, next } = milestoneOverview([], TODAY);
    expect(reached).toEqual([]);
    expect(next.every((m) => m.percent.isZero())).toBe(true);
  });
});

describe("yearMilestones", () => {
  const payments = [
    payment("2024-06-01", "600"),
    payment("2025-03-01", "500"),
    payment("2026-02-01", "900"),
  ];

  it("nennt nur die Meilensteine des Jahres, älteste zuerst", () => {
    const { reached } = yearMilestones(payments, 2025, TODAY);
    expect(reached.every((m) => m.reachedOn.startsWith("2025"))).toBe(true);
    expect(reached.map((m) => m.reachedOn)).toEqual(
      [...reached.map((m) => m.reachedOn)].sort(),
    );
    expect(reached.some((m) => m.kind === "total" && m.threshold === 1000)).toBe(true);
  });

  it("misst die nächste Summen-Stufe am Ende des Jahres, ohne spätere Jahre", () => {
    const { nextTotal } = yearMilestones(payments, 2025, TODAY);
    expect(nextTotal.kind).toBe("total");
    expect(nextTotal.current.toFixed(0)).toBe("1100");
    expect(nextTotal.threshold).toBe(1500);
  });
});
