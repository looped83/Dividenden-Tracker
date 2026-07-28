import { describe, expect, it } from "vitest";
import { EUR, Money, toCurrencyCode } from "@/lib/money";
import {
  compareToPreviousYear,
  type YearOverYearEntry,
} from "@/features/payments/yearOverYear";

function entry(
  id: string,
  effectiveDate: string,
  amount: string,
  overrides: Partial<YearOverYearEntry> = {},
): YearOverYearEntry {
  return {
    id,
    securityId: "s1",
    effectiveDate,
    amount: Money.fromString(amount, EUR),
    cancelled: false,
    ...overrides,
  };
}

describe("compareToPreviousYear", () => {
  it("vergleicht die n-te Zahlung eines Jahres mit der n-ten des Vorjahres", () => {
    const result = compareToPreviousYear([
      entry("p1", "2025-03-10", "50.00"),
      entry("p2", "2025-09-10", "50.00"),
      entry("p3", "2026-03-10", "60.00"),
      entry("p4", "2026-09-10", "40.00"),
    ]);

    expect(result.get("p3")?.direction).toBe("up");
    expect(result.get("p3")?.previousAmount.toStringValue()).toBe("50.00");
    expect(result.get("p3")?.previousDate).toBe("2025-03-10");
    expect(result.get("p3")?.difference.toStringValue()).toBe("10.00");

    expect(result.get("p4")?.direction).toBe("down");
    expect(result.get("p4")?.difference.toStringValue()).toBe("-10.00");
  });

  it("meldet centgenaue Gleichheit als unveraendert", () => {
    const result = compareToPreviousYear([
      entry("p1", "2025-05-02", "73.63"),
      entry("p2", "2026-05-02", "73.63"),
    ]);
    expect(result.get("p2")?.direction).toBe("same");
  });

  it("bewertet einen Cent Unterschied bereits als Veraenderung", () => {
    const result = compareToPreviousYear([
      entry("p1", "2025-05-02", "73.63"),
      entry("p2", "2026-05-02", "73.64"),
    ]);
    expect(result.get("p2")?.direction).toBe("up");
  });

  it("vergleicht unabhaengig vom Zahlungsmonat — die Reihenfolge zaehlt", () => {
    // Jahreszahler mit verschobenem Termin: April im einen, Mai im anderen Jahr.
    const result = compareToPreviousYear([
      entry("p1", "2025-04-28", "100.00"),
      entry("p2", "2026-05-06", "110.00"),
    ]);
    expect(result.get("p2")?.direction).toBe("up");
  });

  it("vergleicht depotuebergreifend, aber nur innerhalb eines Unternehmens", () => {
    const result = compareToPreviousYear([
      entry("p1", "2025-03-10", "50.00"),
      entry("p2", "2026-03-10", "80.00"),
      entry("q1", "2025-03-10", "10.00", { securityId: "s2" }),
      entry("q2", "2026-03-10", "5.00", { securityId: "s2" }),
    ]);
    expect(result.get("p2")?.direction).toBe("up");
    expect(result.get("q2")?.direction).toBe("down");
    expect(result.get("q2")?.previousAmount.toStringValue()).toBe("10.00");
  });

  it("laesst Zahlungen ohne Gegenstueck im Vorjahr unbewertet", () => {
    const result = compareToPreviousYear([
      entry("p1", "2025-03-10", "50.00"),
      entry("p2", "2026-03-10", "60.00"),
      // Zweite Zahlung 2026, im Vorjahr gab es nur eine.
      entry("p3", "2026-09-10", "20.00"),
      // Erstes Jahr ueberhaupt.
      entry("x1", "2026-02-01", "12.00", { securityId: "neu" }),
    ]);
    expect(result.has("p2")).toBe(true);
    expect(result.has("p3")).toBe(false);
    expect(result.has("x1")).toBe(false);
    // Auch das Vorjahr selbst hat keinen Bezug.
    expect(result.has("p1")).toBe(false);
  });

  it("laesst Jahre mit Luecke unbewertet (2024 zu 2026 wird nicht verglichen)", () => {
    const result = compareToPreviousYear([
      entry("p1", "2024-03-10", "50.00"),
      entry("p2", "2026-03-10", "60.00"),
    ]);
    expect(result.has("p2")).toBe(false);
  });

  it("uebergeht stornierte Zahlungen als Bezug und als Ziel", () => {
    const result = compareToPreviousYear([
      entry("storniert", "2025-03-10", "999.00", { cancelled: true }),
      entry("p1", "2025-03-11", "50.00"),
      entry("p2", "2026-03-10", "60.00"),
      entry("p3", "2026-03-11", "70.00", { cancelled: true }),
    ]);
    // p2 ist die erste aktive Zahlung 2026 und trifft auf die erste aktive 2025.
    expect(result.get("p2")?.previousAmount.toStringValue()).toBe("50.00");
    expect(result.has("p3")).toBe(false);
  });

  it("vergleicht keine unterschiedlichen Waehrungen", () => {
    const result = compareToPreviousYear([
      entry("p1", "2025-03-10", "50.00", {
        amount: Money.fromString("50.00", toCurrencyCode("USD")),
      }),
      entry("p2", "2026-03-10", "60.00"),
    ]);
    expect(result.has("p2")).toBe(false);
  });

  it("ordnet Zahlungen desselben Tages stabil nach Kennung", () => {
    const result = compareToPreviousYear([
      entry("b", "2025-03-10", "20.00"),
      entry("a", "2025-03-10", "10.00"),
      entry("d", "2026-03-10", "30.00"),
      entry("c", "2026-03-10", "15.00"),
    ]);
    // Sortiert: 2025 [a, b], 2026 [c, d] → c↔a, d↔b.
    expect(result.get("c")?.previousAmount.toStringValue()).toBe("10.00");
    expect(result.get("d")?.previousAmount.toStringValue()).toBe("20.00");
  });
});
