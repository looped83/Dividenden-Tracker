import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import { paybackOverview, type PaybackHolding } from "@/lib/progress";
import type { AnalyticsPayment } from "@/lib/statistics";

const eur = (value: string) => Money.fromString(value, EUR);

let seq = 0;
function payment(securityId: string, net: string): AnalyticsPayment {
  seq += 1;
  return {
    id: `p${String(seq)}`,
    payDate: "2026-01-15",
    actualPayDate: "2026-01-15",
    netAmount: eur(net),
    grossAmount: eur(net),
    securityId,
    depotId: "dep",
    paymentType: "regular",
    source: "manual",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const holding = (securityId: string, buyin: string): PaybackHolding => ({
  securityId,
  name: securityId,
  buyin: eur(buyin),
});

describe("paybackOverview", () => {
  it("teilt die erhaltenen Dividenden je Asset durch den Einstand", () => {
    const result = paybackOverview(
      [
        payment("A", "300"),
        payment("A", "250"),
        payment("B", "40"),
        payment("C", "1200"),
      ],
      [holding("A", "1000"), holding("B", "400"), holding("C", "1000")],
    );

    expect(
      result.items.map((item) => [item.name, item.percent.toFixed(0), item.status]),
    ).toEqual([
      ["C", "120", "full"],
      ["A", "55", "half"],
      ["B", "10", "started"],
    ]);
    expect(result.items[1]?.missing.toStringValue()).toBe("450.00");
    expect(result.items[0]?.missing.toStringValue()).toBe("0.00");
    expect(result.next?.name).toBe("A");
    expect(result.received.toStringValue()).toBe("1790.00");
    expect(result.buyin.toStringValue()).toBe("2400.00");
    expect(result.percent?.toFixed(1)).toBe("74.6");
  });

  it("zählt Zahlungen nicht mehr gehaltener Assets nicht mit", () => {
    const result = paybackOverview(
      [payment("A", "100"), payment("verkauft", "500")],
      [holding("A", "1000")],
    );
    expect(result.received.toStringValue()).toBe("100.00");
  });

  it("zeigt Positionen ohne Zahlung mit 0 % und lässt solche ohne Einstand weg", () => {
    const result = paybackOverview(
      [payment("A", "-20")],
      [holding("A", "500"), holding("B", "0")],
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.received.toStringValue()).toBe("0.00");
    expect(result.items[0]?.percent.toFixed(0)).toBe("0");
  });

  it("liefert ohne Positionen keinen Anteil", () => {
    const result = paybackOverview([payment("A", "100")], []);
    expect(result.percent).toBeNull();
    expect(result.next).toBeNull();
  });
});
