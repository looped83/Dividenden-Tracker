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

  it("zieht eine verspätete Zahlung auf den letzten fälligen geplanten Monat", () => {
    // Quartalsplan, Zahlung am 2. April -> letzter fälliger Monat März.
    expect(effectivePayDate("2026-04-02", [3, 6, 9, 12])).toBe("2026-03-02");
  });

  it("zieht eine vorgezogene Zahlung in den unmittelbar folgenden geplanten Monat", () => {
    // Plan {1,4,7,10}: Zahlung im Juni gehört zur Juli-Ausschüttung — der
    // letzte fällige Monat (April) liegt zwei Monate zurück.
    expect(effectivePayDate("2026-06-25", [1, 4, 7, 10])).toBe("2026-07-01");
    // Auch früh im Monat, der Kalendertag spielt für die Zuordnung keine Rolle.
    expect(effectivePayDate("2026-06-03", [1, 4, 7, 10])).toBe("2026-07-01");
    // Jahresplan: Juni-Zahlung zählt zum Juli desselben Jahres.
    expect(effectivePayDate("2026-06-25", [7])).toBe("2026-07-01");
  });

  it("zieht über den Jahreswechsel nach vorne (Dezember -> Januar Folgejahr)", () => {
    expect(effectivePayDate("2026-12-28", [1, 4, 7, 10])).toBe("2027-01-01");
  });

  it("bevorzugt bei gleichem Abstand den fälligen (früheren) Monat", () => {
    // April (4), Plan {3,5}: März und Mai sind gleich weit entfernt -> März,
    // denn Zahlungen treffen häufiger spät als früh ein.
    expect(effectivePayDate("2026-04-15", [3, 5])).toBe("2026-03-15");
  });

  it("verschiebt über den Jahreswechsel zurück (Januar -> Dezember Vorjahr)", () => {
    // Januar, Plan {12}: der fällige Dezember liegt einen Monat zurück.
    expect(effectivePayDate("2026-01-03", [12])).toBe("2025-12-03");
    // Februar, Plan {3,6,9,12}: Dezember liegt zwei Monate zurück, März folgt
    // unmittelbar -> vorgezogene März-Zahlung.
    expect(effectivePayDate("2026-02-10", [3, 6, 9, 12])).toBe("2026-03-01");
  });

  it("bleibt beim fälligen Monat, wenn kein geplanter Monat unmittelbar folgt", () => {
    // Mai, Plan {7}: Juni ist nicht geplant -> letzter fälliger Monat Juli 2025.
    expect(effectivePayDate("2026-05-20", [7])).toBe("2025-07-20");
    // 28. Mai, Plan {3,6}: Juni folgt unmittelbar -> vorgezogene Juni-Zahlung.
    expect(effectivePayDate("2026-05-28", [3, 6])).toBe("2026-06-01");
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
