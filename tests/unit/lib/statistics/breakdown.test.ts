import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";
import { breakdownMatrix } from "@/lib/statistics";

let seq = 0;
function p(payDate: string, net: string): AnalyticsPayment {
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

/** 15. Juli 2026 — mitten im laufenden Jahr, mitten im laufenden Monat. */
const HEUTE: RefDate = { year: 2026, month: 7, day: 15 };

/** Zelle (Jahr, Monat) der Matrix. */
function cell(matrix: ReturnType<typeof breakdownMatrix>, year: number, month: number) {
  const row = matrix.months[month - 1];
  const found = row.cells.find((candidate) => candidate.year === year);
  if (!found) throw new Error(`Keine Zelle für ${String(year)}-${String(month)}`);
  return found;
}

describe("breakdownMatrix (§11.12)", () => {
  const payments = [
    p("2024-03-10", "100.00"),
    p("2024-07-20", "200.00"),
    p("2024-12-05", "300.00"),
    p("2025-03-10", "150.00"),
    p("2025-07-10", "100.00"),
    p("2025-07-20", "100.00"),
    p("2026-03-10", "180.00"),
    p("2026-07-10", "260.00"),
  ];

  it("liefert zwölf Zeilen und eine Spalte je Jahr, aufsteigend", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    expect(matrix.months).toHaveLength(12);
    expect(matrix.years.map((column) => column.year)).toEqual([2024, 2025, 2026]);
    expect(matrix.months.map((row) => row.cells.length)).toEqual(Array(12).fill(3));
  });

  it("summiert je Zelle und je Zeile über alle Jahre", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    expect(cell(matrix, 2025, 7).net.toStringValue()).toBe("200.00");
    expect(cell(matrix, 2025, 7).count).toBe(2);
    // März: 100 + 150 + 180
    expect(matrix.months[2].net.toStringValue()).toBe("430.00");
    expect(matrix.months[2].count).toBe(3);
  });

  it("führt die laufende Jahressumme je Spalte mit", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    expect(cell(matrix, 2024, 3).cumulative.toStringValue()).toBe("100.00");
    expect(cell(matrix, 2024, 7).cumulative.toStringValue()).toBe("300.00");
    expect(cell(matrix, 2024, 12).cumulative.toStringValue()).toBe("600.00");
    // Dezemberwert der Spalte entspricht der Jahressumme.
    expect(matrix.years[0].net.toStringValue()).toBe("600.00");
  });

  it("kennzeichnet noch nicht erreichte Monate statt sie als 0 € zu zählen", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    expect(cell(matrix, 2026, 8).future).toBe(true);
    expect(cell(matrix, 2026, 7).future).toBe(false);
    // Abgeschlossene Jahre haben keine Zukunftsmonate, auch ohne Zahlungen.
    expect(cell(matrix, 2024, 8).future).toBe(false);
    expect(cell(matrix, 2024, 8).count).toBe(0);
  });

  it("markiert den laufenden Monat des laufenden Jahres", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    expect(cell(matrix, 2026, 7).partial).toBe(true);
    expect(cell(matrix, 2026, 3).partial).toBe(false);
    expect(cell(matrix, 2025, 7).partial).toBe(false);
  });

  it("vergleicht jeden Monat mit demselben Monat des Vorjahres", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    // März 2025: 150 gegen 100 → +50 %.
    const maerz = cell(matrix, 2025, 3).change;
    expect(maerz.kind).toBe("percent");
    if (maerz.kind === "percent") {
      expect(maerz.absolute.toStringValue()).toBe("50.00");
      expect(maerz.percent.toNumber()).toBeCloseTo(50);
    }
  });

  it("kappt den laufenden Monat auf beiden Seiten am Stichtag", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    // Juli 2026: 260 € (10.07.). Juli 2025 hat 200 €, davon liegen nur die
    // 100 € vom 10.07. vor dem Stichtag — verglichen wird 260 gegen 100.
    const juli = cell(matrix, 2026, 7).change;
    expect(juli.kind).toBe("percent");
    if (juli.kind === "percent") {
      expect(juli.absolute.toStringValue()).toBe("160.00");
      expect(juli.percent.toNumber()).toBeCloseTo(160);
    }
    // Die angezeigte Summe bleibt der volle Monatswert.
    expect(cell(matrix, 2026, 7).net.toStringValue()).toBe("260.00");
  });

  it("vergleicht ohne Vorjahr in der Datenbasis gar nicht", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    expect(cell(matrix, 2024, 3).change.kind).toBe("no-comparison");
    expect(matrix.years[0].change.kind).toBe("no-comparison");
  });

  it("vergleicht das laufende Jahr über denselben Ausschnitt", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    const laufend = matrix.years[2];
    expect(laufend.running).toBe(true);
    expect(laufend.net.toStringValue()).toBe("440.00");
    // 1.1.–15.7.2026 (440 €) gegen 1.1.–15.7.2025 (150 + 100 = 250 €).
    expect(laufend.change.kind).toBe("percent");
    if (laufend.change.kind === "percent") {
      expect(laufend.change.absolute.toStringValue()).toBe("190.00");
    }
  });

  it("mittelt nur über abgeschlossene Jahre", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    expect(matrix.completedYears).toBe(2);
    // März: (100 + 150) ÷ 2 = 125 €; das laufende Jahr zählt nicht mit.
    expect(matrix.months[2].average?.toStringValue()).toBe("125.00");
    // Dezember: (300 + 0) ÷ 2 = 150 € — ein zahlungsfreier Dezember 2025 zählt.
    expect(matrix.months[11].average?.toStringValue()).toBe("150.00");
  });

  it("summiert die Zeilendurchschnitte zum Gesamtdurchschnitt", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    const summe = matrix.months.reduce(
      (total, row) => (row.average ? total.add(row.average) : total),
      Money.zero(EUR),
    );
    expect(summe.toStringValue()).toBe(matrix.totals.average?.toStringValue());
  });

  it("zählt Monate mit Zahlungen je Jahr", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    expect(matrix.years[0].activeMonths).toBe(3);
    expect(matrix.years[1].activeMonths).toBe(2);
  });

  it("nennt Gesamtsumme, Anzahl und Stichtag", () => {
    const matrix = breakdownMatrix(payments, HEUTE);
    expect(matrix.totals.net.toStringValue()).toBe("1390.00");
    expect(matrix.totals.count).toBe(8);
    expect(matrix.cutoff).toBe("2026-07-15");
  });

  it("bleibt ohne Zahlungen leer, aber gültig", () => {
    const matrix = breakdownMatrix([], HEUTE);
    expect(matrix.years).toHaveLength(0);
    expect(matrix.months).toHaveLength(12);
    expect(matrix.months[0].cells).toHaveLength(0);
    expect(matrix.totals.net.isZero()).toBe(true);
    expect(matrix.totals.average).toBeNull();
    expect(matrix.completedYears).toBe(0);
  });

  it("lässt den Durchschnitt ohne abgeschlossenes Jahr offen", () => {
    const matrix = breakdownMatrix([p("2026-03-10", "180.00")], HEUTE);
    expect(matrix.completedYears).toBe(0);
    expect(matrix.months[2].average).toBeNull();
    expect(matrix.totals.average).toBeNull();
  });

  it("bildet den 29.02. auf den letzten gültigen Tag des Vorjahres ab", () => {
    // Stichtag 29.02.2028 (Schaltjahr); Februar 2027 endet am 28.
    const schalttag: RefDate = { year: 2028, month: 2, day: 29 };
    const matrix = breakdownMatrix(
      [p("2027-02-28", "100.00"), p("2028-02-15", "150.00")],
      schalttag,
    );
    const februar = cell(matrix, 2028, 2).change;
    expect(februar.kind).toBe("percent");
    if (februar.kind === "percent") {
      expect(februar.absolute.toStringValue()).toBe("50.00");
    }
  });
});
