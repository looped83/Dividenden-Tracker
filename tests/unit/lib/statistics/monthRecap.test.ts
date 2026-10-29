import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import {
  monthRecap,
  recapMonth,
  reinvestedSummary,
  type AnalyticsPayment,
} from "@/lib/statistics";

let seq = 0;
function p(payDate: string, net: string, security = "sec-a"): AnalyticsPayment {
  seq += 1;
  return {
    id: `id-${String(seq)}`,
    payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: security,
    depotId: "dep-1",
    paymentType: "regular",
    source: "manual",
    createdAt: `${payDate}T10:00:00Z`,
  };
}

describe("recapMonth", () => {
  it("nennt den Vormonat vom 1. bis 7. eines Monats", () => {
    expect(recapMonth({ year: 2026, month: 10, day: 1 })).toEqual({
      year: 2026,
      month: 9,
    });
    expect(recapMonth({ year: 2026, month: 10, day: 7 })).toEqual({
      year: 2026,
      month: 9,
    });
    expect(recapMonth({ year: 2026, month: 10, day: 8 })).toBeNull();
  });

  it("schweigt im Januar, dort steht der Jahresrückblick", () => {
    expect(recapMonth({ year: 2027, month: 1, day: 2 })).toBeNull();
  });
});

describe("monthRecap", () => {
  const ref = { year: 2026, month: 10, day: 3 };

  it("summiert den ganzen Vormonat und den ganzen Vorjahresmonat", () => {
    const recap = monthRecap(
      [
        p("2026-09-01", "10"),
        p("2026-09-30", "20", "sec-b"),
        p("2026-10-01", "99"),
        p("2025-09-30", "15"),
        p("2025-08-31", "99"),
      ],
      ref,
    );
    expect(recap?.net.toDecimal().toString()).toBe("30");
    expect(recap?.count).toBe(2);
    expect(recap?.assets).toBe(2);
    expect(recap?.priorNet.toDecimal().toString()).toBe("15");
  });

  it("nennt den stärksten Zahler über alle Zahlungen eines Assets", () => {
    const recap = monthRecap(
      [
        p("2026-09-02", "12", "sec-a"),
        p("2026-09-20", "12", "sec-a"),
        p("2026-09-10", "20", "sec-b"),
      ],
      ref,
    );
    expect(recap?.top?.securityId).toBe("sec-a");
    expect(recap?.top?.net.toDecimal().toString()).toBe("24");
  });

  it("liefert ohne Zahlungen keinen Zahler und außerhalb des Zeitraums nichts", () => {
    expect(monthRecap([], ref)?.top).toBeNull();
    expect(
      monthRecap([p("2026-09-02", "1")], { year: 2026, month: 10, day: 8 }),
    ).toBeNull();
  });
});

describe("reinvestedSummary", () => {
  const since = new Map([["sec-a", "2026-09-15"]]);
  const sinceOf = (id: string) => since.get(id);

  it("zählt nur Zahlungen ab dem Tag des Einschaltens", () => {
    const result = reinvestedSummary(
      [
        p("2026-09-10", "5.00"),
        p("2026-09-15", "7.00"),
        p("2026-09-20", "3.00"),
        p("2026-09-20", "9.00", "sec-b"),
      ],
      sinceOf,
    );
    expect(result?.net.toDecimal().toString()).toBe("10");
    expect(result?.securities).toBe(1);
  });

  it("ist ohne reinvestierte Zahlung leer", () => {
    expect(reinvestedSummary([p("2026-09-10", "5.00")], sinceOf)).toBeNull();
  });

  it("steht im Monatsabschluss", () => {
    const recap = monthRecap(
      [p("2026-09-20", "4.00"), p("2026-09-21", "6.00", "sec-b")],
      { year: 2026, month: 10, day: 2 },
      undefined,
      sinceOf,
    );
    expect(recap?.reinvested?.net.toDecimal().toString()).toBe("4");
  });
});
