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
  it("vergleicht mit der Zahlung desselben Monats im Vorjahr", () => {
    const result = compareToPreviousYear([
      entry("p1", "2025-03-10", "50.00"),
      entry("p2", "2025-09-10", "50.00"),
      entry("p3", "2026-03-12", "60.00"),
      entry("p4", "2026-09-08", "40.00"),
    ]);

    expect(result.get("p3")?.direction).toBe("up");
    expect(result.get("p3")?.previousAmount.toStringValue()).toBe("50.00");
    expect(result.get("p3")?.previousDate).toBe("2025-03-10");
    expect(result.get("p3")?.difference.toStringValue()).toBe("10.00");

    expect(result.get("p4")?.direction).toBe("down");
    expect(result.get("p4")?.difference.toStringValue()).toBe("-10.00");
  });

  it("laesst eine ausgefallene Zahlung die uebrigen Vergleiche nicht verschieben", () => {
    // Kernfall: 2026 faellt das Maerzquartal aus. Ueber die Reihenfolge im Jahr
    // waeren Juni/September/Dezember allesamt falsch zugeordnet.
    const result = compareToPreviousYear([
      entry("a1", "2025-03-10", "10.00"),
      entry("a2", "2025-06-10", "20.00"),
      entry("a3", "2025-09-10", "30.00"),
      entry("a4", "2025-12-10", "40.00"),
      entry("b2", "2026-06-10", "22.00"),
      entry("b3", "2026-09-10", "33.00"),
      entry("b4", "2026-12-10", "44.00"),
    ]);

    expect(result.get("b2")?.previousAmount.toStringValue()).toBe("20.00");
    expect(result.get("b3")?.previousAmount.toStringValue()).toBe("30.00");
    expect(result.get("b4")?.previousAmount.toStringValue()).toBe("40.00");
  });

  it("meldet centgenaue Gleichheit als unveraendert", () => {
    const result = compareToPreviousYear([
      entry("p1", "2025-05-02", "73.63"),
      entry("p2", "2026-05-20", "73.63"),
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

  it("vergleicht nicht ueber Monatsgrenzen hinweg", () => {
    // Ohne gepflegten Ausschuettungsplan bleibt das echte Datum massgeblich;
    // ein verschobener Termin findet dann kein Gegenstueck. Lieber kein Pfeil
    // als ein geratener.
    const result = compareToPreviousYear([
      entry("p1", "2025-04-28", "100.00"),
      entry("p2", "2026-05-06", "110.00"),
    ]);
    expect(result.has("p2")).toBe(false);
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

  it("bewertet nichts, wenn im Vorjahresmonat nichts steht", () => {
    const result = compareToPreviousYear([
      entry("p1", "2025-03-10", "50.00"),
      entry("p2", "2026-03-10", "60.00"),
      entry("p3", "2026-09-10", "20.00"),
      entry("x1", "2026-02-01", "12.00", { securityId: "neu" }),
    ]);
    expect(result.has("p2")).toBe(true);
    expect(result.has("p3")).toBe(false);
    expect(result.has("x1")).toBe(false);
    // Das Vorjahr selbst hat keinen Bezug.
    expect(result.has("p1")).toBe(false);
  });

  it("laesst Jahre mit Luecke unbewertet (2024 zu 2026 wird nicht verglichen)", () => {
    const result = compareToPreviousYear([
      entry("p1", "2024-03-10", "50.00"),
      entry("p2", "2026-03-10", "60.00"),
    ]);
    expect(result.has("p2")).toBe(false);
  });

  it("bewertet nichts, wenn ein Monat mehrere Zahlungen enthaelt", () => {
    const result = compareToPreviousYear([
      entry("p1", "2025-03-10", "50.00"),
      // Nachzahlung im selben Monat: welche zu welcher gehoert, ist offen.
      entry("p2", "2026-03-10", "60.00"),
      entry("p3", "2026-03-24", "5.00"),
    ]);
    expect(result.has("p2")).toBe(false);
    expect(result.has("p3")).toBe(false);
  });

  it("bewertet nichts, wenn der Vorjahresmonat mehrere Zahlungen enthaelt", () => {
    const result = compareToPreviousYear([
      entry("p1", "2025-03-10", "50.00"),
      entry("p2", "2025-03-24", "5.00"),
      entry("p3", "2026-03-10", "60.00"),
    ]);
    expect(result.has("p3")).toBe(false);
  });

  it("uebergeht stornierte Zahlungen als Bezug und als Ziel", () => {
    const result = compareToPreviousYear([
      // Storniert: macht den Vorjahresmonat nicht mehrdeutig.
      entry("storniert", "2025-03-05", "999.00", { cancelled: true }),
      entry("p1", "2025-03-11", "50.00"),
      entry("p2", "2026-03-10", "60.00"),
      entry("p3", "2026-06-11", "70.00", { cancelled: true }),
    ]);
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
});
