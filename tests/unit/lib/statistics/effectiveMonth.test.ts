import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import {
  effectivePayDate,
  normalizePayoutMonths,
  payoutMonthsBySecurity,
  withEffectiveDates,
} from "@/lib/statistics";

describe("effectivePayDate (§10 Ausschüttungsmonate)", () => {
  it("lässt das Datum unverändert ohne Plan", () => {
    expect(effectivePayDate("2026-04-02", null)).toBe("2026-04-02");
    expect(effectivePayDate("2026-04-02", [])).toBe("2026-04-02");
  });

  it("zieht eine verspätete Zahlung auf den Monatsletzten des fälligen geplanten Monats", () => {
    // Quartalsplan, Zahlung am 2. April -> letzter fälliger Monat März, als
    // letzte Buchung des Monats (31.03.), nicht am 02.03.
    expect(effectivePayDate("2026-04-02", [3, 6, 9, 12])).toBe("2026-03-31");
    // Zahlung am 2. Oktober bei Plan September -> 30.09.
    expect(effectivePayDate("2026-10-02", [3, 6, 9, 12])).toBe("2026-09-30");
  });

  it("zieht nie nach vorne", () => {
    // Plan {1,4,7,10}: Zahlung Ende Juni bleibt im Juni, auch über den Jahreswechsel.
    expect(effectivePayDate("2026-06-25", [1, 4, 7, 10])).toBe("2026-06-25");
    expect(effectivePayDate("2026-12-28", [1, 4, 7, 10])).toBe("2026-12-28");
  });

  it("verschiebt nur bis zum 7. des Monats", () => {
    expect(effectivePayDate("2026-04-07", [3, 6, 9, 12])).toBe("2026-03-31");
    expect(effectivePayDate("2026-04-08", [3, 6, 9, 12])).toBe("2026-04-08");
  });

  it("verschiebt höchstens einen Monat zurück", () => {
    // Mai, Plan {3}: April ist nicht geplant -> bleibt im Mai.
    expect(effectivePayDate("2026-05-03", [3])).toBe("2026-05-03");
  });

  it("verschiebt über den Jahreswechsel zurück (Januar -> Dezember Vorjahr)", () => {
    expect(effectivePayDate("2026-01-03", [12])).toBe("2025-12-31");
  });

  it("nimmt den Monatsletzten des Vormonats, auch im Februar", () => {
    expect(effectivePayDate("2025-03-05", [2])).toBe("2025-02-28");
    expect(effectivePayDate("2024-03-05", [2])).toBe("2024-02-29");
  });

  it("verschiebt bei Monatszahlern nur, wenn der Vormonat leer und dieser Monat doppelt ist", () => {
    const monthly = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    // Ohne Zaehlung: bleibt.
    expect(effectivePayDate("2020-10-02", monthly)).toBe("2020-10-02");
    // September leer, Oktober doppelt -> die fruehe Zahlung gehoert zum September.
    const counts = (_year: number, month: number) => (month === 10 ? 2 : 0);
    expect(effectivePayDate("2020-10-02", monthly, counts)).toBe("2020-09-30");
    // September hat eine Zahlung -> bleibt im Oktober.
    const filled = (_year: number, month: number) => (month === 9 ? 1 : 2);
    expect(effectivePayDate("2020-10-02", monthly, filled)).toBe("2020-10-02");
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

describe("payoutMonthsBySecurity", () => {
  it("fuehrt nur Unternehmen mit gueltigem Plan, normalisiert", () => {
    const map = payoutMonthsBySecurity([
      { id: "a", payout_months: [12, 6, 6] },
      { id: "b", payout_months: [] },
      { id: "c", payout_months: null },
      { id: "d", payout_months: [0, 13] },
    ]);
    expect([...map]).toEqual([["a", [6, 12]]]);
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
    expect(result[0]?.payDate).toBe("2026-03-31");
    expect(result[0]?.actualPayDate).toBe("2026-04-02");
    // sec-none: kein Plan -> unverändert.
    expect(result[1]?.payDate).toBe("2026-04-02");
  });

  it("zaehlt bei Monatszahlern die eigene Historie", () => {
    const monthly = new Map([["sec-m", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]]);
    const result = withEffectiveDates(
      [
        payment("a", "sec-m", "2020-08-28"),
        payment("b", "sec-m", "2020-10-02"),
        payment("c", "sec-m", "2020-10-30"),
      ],
      monthly,
    );
    expect(result.map((entry) => entry.payDate)).toEqual([
      "2020-08-28",
      "2020-09-30",
      "2020-10-30",
    ]);
  });
});
