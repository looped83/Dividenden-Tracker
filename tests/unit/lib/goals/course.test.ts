import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";
import {
  computeGoalCourse,
  computeGoalProgress,
  type ExpectedRest,
  type Goal,
} from "@/lib/goals";

const eur = (value: string) => Money.fromString(value, EUR);
const OCT_2026: RefDate = { year: 2026, month: 10, day: 23 };

function payment(payDate: string, net: string): AnalyticsPayment {
  return {
    id: `p-${payDate}`,
    payDate,
    actualPayDate: payDate,
    netAmount: eur(net),
    grossAmount: eur(net),
    securityId: "sec",
    depotId: "dep",
    paymentType: "regular",
    source: "manual",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function goal(year: number, target: string, month: number | null = null): Goal {
  return {
    id: `g-${String(year)}-${String(month)}`,
    goalType: month === null ? "annual" : "monthly",
    year,
    month,
    targetAmount: eur(target),
    currency: "EUR",
    title: null,
    note: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

/** 1.000 € erhalten: 600 € im März, 400 € im Oktober. */
const PAYMENTS = [payment("2026-03-10", "600"), payment("2026-10-05", "400")];

function rest(year: string, byMonth: Record<number, string> = {}): ExpectedRest {
  return {
    year: eur(year),
    byMonth: Array.from({ length: 12 }, (_, i) => eur(byMonth[i + 1] ?? "0")),
  };
}

function course(g: Goal, r: ExpectedRest, ref: RefDate = OCT_2026) {
  return computeGoalCourse(computeGoalProgress(g, PAYMENTS, ref), r, ref);
}

describe("computeGoalCourse", () => {
  it("rechnet das Jahresziel als erhalten plus Rest des Jahres", () => {
    const result = course(goal(2026, "1500"), rest("500"));
    expect(result?.kind).toBe("onTrack");
    expect(result?.expected.equals(eur("1500"))).toBe(true);
    expect(result?.percent.toNumber()).toBe(100);
  });

  it("nennt bis 5 % unter dem Ziel knapp, darunter unter Plan", () => {
    expect(course(goal(2026, "1500"), rest("425"))?.kind).toBe("close"); // 95,0 %
    expect(course(goal(2026, "1500"), rest("424"))?.kind).toBe("behind"); // 94,9 %
  });

  it("nimmt für ein Monatsziel nur den Rest seines Monats", () => {
    const r = rest("900", { 10: "100", 11: "300", 12: "500" });
    const october = course(goal(2026, "550", 10), r);
    expect(october?.expected.equals(eur("500"))).toBe(true);
    expect(october?.kind).toBe("behind");
    // Bevorstehend im laufenden Jahr: nur der erwartete Betrag.
    const december = course(goal(2026, "500", 12), r);
    expect(december?.expected.equals(eur("500"))).toBe(true);
    expect(december?.kind).toBe("onTrack");
  });

  it("rechnet nichts für Erreichtes, Vergangenes oder das nächste Jahr", () => {
    expect(course(goal(2026, "900"), rest("500"))).toBeNull(); // übertroffen
    expect(course(goal(2026, "700", 3), rest("500"))).toBeNull(); // März vorbei
    expect(course(goal(2026, "100", 9), rest("500"))).toBeNull(); // verfehlt, vorbei
    expect(course(goal(2027, "2000"), rest("500"))).toBeNull();
    expect(course(goal(2027, "200", 1), rest("500"))).toBeNull();
  });

  it("zählt einen negativen Rest nicht", () => {
    const result = course(goal(2026, "1200"), rest("-50"));
    expect(result?.expected.equals(eur("1000"))).toBe(true);
  });
});
