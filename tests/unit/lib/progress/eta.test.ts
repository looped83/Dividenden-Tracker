import { describe, expect, it } from "vitest";
import { EUR, Money, MoneyDecimal, type DecimalInstance } from "@/lib/money";
import {
  coverFixedCosts,
  fixedCost,
  milestoneOverview,
  progressEtas,
} from "@/lib/progress";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";

let seq = 0;
function payment(payDate: string, net: string): AnalyticsPayment {
  seq += 1;
  return {
    id: `p${String(seq)}`,
    payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: "sec",
    depotId: "dep",
    paymentType: "regular",
    source: "manual",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const eur = (value: string) => Money.fromString(value, EUR);
const TODAY: RefDate = { year: 2026, month: 10, day: 26 };

/** 100 € in jedem Monat von Okt 2025 bis Sep 2026, im laufenden Monat noch nichts. */
const MONTHLY = Array.from({ length: 12 }, (_, index) => {
  const month = ((9 + index) % 12) + 1;
  const year = index < 3 ? 2025 : 2026;
  return payment(`${String(year)}-${String(month).padStart(2, "0")}-15`, "100");
});

/** Wachstum gegenüber heute in Prozent, gleichbleibend. */
const flat = (percent: number, months = 120) =>
  Array.from({ length: months }, () => new MoneyDecimal(percent).dividedBy(100));

function etas(
  payments: AnalyticsPayment[],
  growth: DecimalInstance[],
  costs = coverFixedCosts([], eur("0")),
) {
  return progressEtas({
    payments,
    today: TODAY,
    growth,
    milestones: milestoneOverview(payments, TODAY).next,
    coverage: costs,
  });
}

describe("progressEtas", () => {
  it("datiert die Meilensteine nach der Monatsreihe", () => {
    const result = etas(MONTHLY, flat(100));

    // 1.200 € insgesamt: 1.500 € fallen mit drei weiteren Monaten (Jan 2027).
    expect(result.milestones.get("total")).toEqual({ year: 2027, month: 1 });
    // Bestes Jahr 900 € (Jan–Sep 2026); 1.000 € mit dem November.
    expect(result.milestones.get("year")).toEqual({ year: 2026, month: 11 });
    // Ein Monat über 150 € kommt bei 100 € im Monat nie.
    expect(result.milestones.has("month")).toBe(false);
    // Serie 12, nächste Stufe 24: Oktober zählt mit, dann elf weitere Monate.
    expect(result.milestones.get("streak")).toEqual({ year: 2027, month: 9 });
  });

  it("folgt dem Muster des Vorjahreszeitraums", () => {
    // Nur im März 1.200 €; mit 30 % Wachstum bringt der März 2027 1.560 € und
    // schafft 1.500 €.
    const result = etas([payment("2026-03-10", "1200")], flat(130));

    expect(result.milestones.get("month")).toEqual({ year: 2027, month: 3 });
    // Ohne Zahlung in den anderen Monaten kommt keine Serie zustande.
    expect(result.milestones.has("streak")).toBe(false);
  });

  it("deckt offene Fixkosten, sobald der Ø der zwölf Monate sie trägt", () => {
    const coverage = coverFixedCosts(
      [fixedCost("handy", "Handy", eur("90")), fixedCost("strom", "Strom", eur("30"))],
      eur("100"),
    );

    // Doppeltes Wachstum, ab November 200 € statt 100 €: Der Ø steigt je Monat um
    // 100/12; der Oktober ohne Zahlung kostet einen Schritt. 120 € im Februar.
    const result = etas(MONTHLY, flat(200), coverage);

    expect(result.costs.has("strom")).toBe(false);
    expect(result.costs.get("handy")).toEqual({ year: 2027, month: 2 });
  });

  it("nennt ohne Zahlungen im Vorjahreszeitraum keine Termine", () => {
    const result = etas([payment("2024-03-10", "100")], flat(100));
    expect(result.milestones.size).toBe(0);
    expect(result.costs.size).toBe(0);
  });
});
