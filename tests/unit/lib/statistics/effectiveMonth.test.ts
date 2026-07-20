import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import {
  effectivePayDate,
  normalizePayoutMonths,
  withEffectiveDates,
} from "@/lib/statistics";

describe("effectivePayDate (§10 Ausschüttungsmonate)", () => {
  it("lässt das Datum unverändert ohne Plan", () => {
    expect(effectivePayDate("2026-04-02", null)).toBe("2026-04-02");
    expect(effectivePayDate("2026-04-02", [])).toBe("2026-04-02");
  });

  it("zieht eine verspätete Zahlung auf den nächstliegenden geplanten Monat", () => {
    // Quartalsplan, Zahlung am 2. April -> nächster geplanter Monat März.
    expect(effectivePayDate("2026-04-02", [3, 6, 9, 12])).toBe("2026-03-02");
  });

  it("ordnet eine leicht verfrühte Zahlung dem nächsten geplanten Monat zu", () => {
    // Zahlung 28. Mai, Plan {3,6}: näher an Juni (1) als März (2).
    expect(effectivePayDate("2026-05-28", [3, 6])).toBe("2026-06-28");
  });

  it("verschiebt über den Jahreswechsel zurück (Januar -> Dezember Vorjahr)", () => {
    expect(effectivePayDate("2026-01-03", [12])).toBe("2025-12-03");
  });

  it("verschiebt über den Jahreswechsel vor (Dezember -> Januar Folgejahr)", () => {
    expect(effectivePayDate("2025-12-28", [1])).toBe("2026-01-28");
  });

  it("bevorzugt bei Gleichstand den früheren Monat", () => {
    // April (4), Plan {3,5}: gleich weit zu März (1) und Mai (1) -> März.
    expect(effectivePayDate("2026-04-15", [3, 5])).toBe("2026-03-15");
  });

  it("begrenzt den Tag auf die Monatslänge des Zielmonats", () => {
    // 31. März -> geplanter Februar 2025 (28 Tage) -> 28.02.
    expect(effectivePayDate("2025-03-31", [2])).toBe("2025-02-28");
  });

  it("lässt eine Zahlung im geplanten Monat unverändert", () => {
    expect(effectivePayDate("2026-06-15", [3, 6, 9, 12])).toBe("2026-06-15");
  });
});

describe("normalizePayoutMonths", () => {
  it("entfernt Duplikate/Ungültiges und sortiert", () => {
    expect(normalizePayoutMonths([6, 3, 3, 13, 0, 12])).toEqual([3, 6, 12]);
    expect(normalizePayoutMonths(null)).toEqual([]);
  });
});

describe("withEffectiveDates", () => {
  const payment = (id: string, security: string, payDate: string): AnalyticsPayment => ({
    id,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString("10", EUR),
    grossAmount: Money.fromString("10", EUR),
    securityId: security,
    depotId: "dep-1",
    paymentType: "regular",
    source: "manual",
    createdAt: `${payDate}T10:00:00Z`,
  });

  it("wendet den Plan an und erhält das echte Datum", () => {
    const payments = [
      payment("a", "sec-plan", "2026-04-02"),
      payment("b", "sec-none", "2026-04-02"),
    ];
    const result = withEffectiveDates(payments, new Map([["sec-plan", [3, 6, 9, 12]]]));
    // sec-plan: auf März gezogen, actualPayDate unverändert.
    expect(result[0]?.payDate).toBe("2026-03-02");
    expect(result[0]?.actualPayDate).toBe("2026-04-02");
    // sec-none: kein Plan -> unverändert.
    expect(result[1]?.payDate).toBe("2026-04-02");
  });
});
