import { describe, expect, it } from "vitest";
import { activeAnalyticsPayments, mapAnalyticsPayment } from "@/lib/statistics";

const base = {
  id: "p1",
  pay_date: "2026-03-10",
  security_id: "sec-a",
  depot_id: "dep-1",
  payment_type: "regular" as const,
  source: "manual" as const,
  created_at: "2026-03-10T10:00:00Z",
};

describe("mapAnalyticsPayment", () => {
  it("parst String-Beträge (kanonisches Transportformat)", () => {
    const mapped = mapAnalyticsPayment({
      ...base,
      net_amount: "85.00",
      gross_amount: "100.00",
    });
    expect(mapped.netAmount.toStringValue()).toBe("85.00");
    expect(mapped.grossAmount.toStringValue()).toBe("100.00");
  });

  it("verarbeitet numerische Beträge, wie PostgREST sie liefert (Regression: e.trim is not a function)", () => {
    const mapped = mapAnalyticsPayment({
      ...base,
      // PostgREST liefert numeric-Spalten je nach Cast als JSON-Zahl.
      net_amount: 85,
      gross_amount: 100.5,
    });
    expect(mapped.netAmount.toStringValue()).toBe("85.00");
    expect(mapped.grossAmount.toStringValue()).toBe("100.50");
  });
});

describe("activeAnalyticsPayments", () => {
  const row = (id: string, archived_at: string | null) => ({
    ...base,
    id,
    net_amount: "10.00",
    gross_amount: "10.00",
    archived_at,
  });

  it("nimmt nur aktive Eingaenge", () => {
    const active = activeAnalyticsPayments([row("p1", null), row("p2", "2026-04-01")]);
    expect(active.map((payment) => payment.id)).toEqual(["p1"]);
  });

  it("parst dieselbe geladene Liste nur einmal, eine neue erneut", () => {
    // Uebersicht, Statistik und Ziele sind je eigene Beobachter derselben
    // Abfrage; sie teilen sich das Ergebnis, statt es neu zu parsen.
    const loaded = [row("p1", null)];
    expect(activeAnalyticsPayments(loaded)).toBe(activeAnalyticsPayments(loaded));
    expect(activeAnalyticsPayments([row("p1", null)])).not.toBe(
      activeAnalyticsPayments(loaded),
    );
  });
});
