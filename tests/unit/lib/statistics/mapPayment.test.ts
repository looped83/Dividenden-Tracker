import { describe, expect, it } from "vitest";
import { mapAnalyticsPayment } from "@/lib/statistics";

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
