import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";
import { computeGoalProgress, sortGoalProgress, type Goal } from "@/lib/goals";

let seq = 0;
function payment(payDate: string, net: string): AnalyticsPayment {
  seq += 1;
  return {
    id: `p${String(seq)}`,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: "sec",
    depotId: "dep",
    paymentType: "regular",
    source: "manual",
    createdAt: "2027-01-01T00:00:00Z",
  };
}

function annualGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    goalType: "annual",
    year: 2027,
    month: null,
    targetAmount: Money.fromString("12000.00", EUR),
    currency: "EUR",
    title: null,
    note: null,
    createdAt: "2027-01-01T00:00:00Z",
    updatedAt: "2027-01-01T00:00:00Z",
    ...overrides,
  };
}

const midYear: RefDate = { year: 2027, month: 7, day: 1 };
const afterYear: RefDate = { year: 2028, month: 1, day: 1 };
const beforeYear: RefDate = { year: 2026, month: 6, day: 1 };

describe("computeGoalProgress – Fortschrittswerte", () => {
  it("Zielerreichung unter 100 % mit verbleibendem Betrag", () => {
    const goal = annualGoal();
    const payments = [payment("2027-03-01", "9000.00")];
    const progress = computeGoalProgress(goal, payments, midYear);
    expect(progress.actual.toStringValue()).toBe("9000.00");
    expect(progress.percent.toNumber()).toBeCloseTo(75, 6);
    expect(progress.remaining.toStringValue()).toBe("3000.00");
    expect(progress.overshoot.isZero()).toBe(true);
    expect(progress.status).toBe("active");
  });

  it("Zielerreichung genau 100 % => erreicht, kein Restbetrag", () => {
    const goal = annualGoal();
    const progress = computeGoalProgress(
      goal,
      [payment("2027-05-01", "12000.00")],
      midYear,
    );
    expect(progress.percent.toNumber()).toBe(100);
    expect(progress.remaining.isZero()).toBe(true);
    expect(progress.overshoot.isZero()).toBe(true);
    expect(progress.status).toBe("reached");
  });

  it("Zielerreichung über 100 % => übertroffen mit überschrittenem Betrag", () => {
    const goal = annualGoal();
    const progress = computeGoalProgress(
      goal,
      [payment("2027-05-01", "13200.00")],
      midYear,
    );
    expect(progress.percent.toNumber()).toBeCloseTo(110, 6);
    expect(progress.remaining.isZero()).toBe(true);
    expect(progress.overshoot.toStringValue()).toBe("1200.00");
    expect(progress.status).toBe("exceeded");
  });

  it("summiert mehrere Zahlungen decimal-sicher", () => {
    const goal = annualGoal({ targetAmount: Money.fromString("100.00", EUR) });
    const payments = [
      payment("2027-01-10", "0.10"),
      payment("2027-02-10", "0.20"),
      payment("2027-03-10", "0.10"),
    ];
    const progress = computeGoalProgress(goal, payments, midYear);
    expect(progress.actual.toStringValue()).toBe("0.40");
  });
});

describe("computeGoalProgress – Zielstatus", () => {
  it("bevorstehend, solange der Zeitraum nicht begonnen hat", () => {
    const progress = computeGoalProgress(annualGoal(), [], beforeYear);
    expect(progress.status).toBe("upcoming");
    expect(progress.actual.isZero()).toBe(true);
  });

  it("aktiv, wenn laufend und Ziel noch nicht erreicht", () => {
    const progress = computeGoalProgress(
      annualGoal(),
      [payment("2027-02-01", "100.00")],
      midYear,
    );
    expect(progress.status).toBe("active");
  });

  it("beendet und nicht erreicht, wenn Zeitraum vorbei und Ziel verfehlt", () => {
    const progress = computeGoalProgress(
      annualGoal(),
      [payment("2027-02-01", "5000.00")],
      afterYear,
    );
    expect(progress.status).toBe("missed");
  });

  it("übertroffen bleibt auch nach Periodenende bestehen", () => {
    const progress = computeGoalProgress(
      annualGoal(),
      [payment("2027-02-01", "13000.00")],
      afterYear,
    );
    expect(progress.status).toBe("exceeded");
  });
});

describe("computeGoalProgress – Berechnungsgrundlage", () => {
  it("nur Zahlungen im Zielzeitraum zählen (fachliches Zahlungsdatum)", () => {
    const goal = annualGoal();
    const payments = [
      payment("2026-12-31", "1000.00"), // vorheriges Jahr
      payment("2027-06-15", "2000.00"), // im Zielzeitraum
      payment("2028-01-01", "4000.00"), // Folgejahr
    ];
    const progress = computeGoalProgress(goal, payments, afterYear);
    expect(progress.actual.toStringValue()).toBe("2000.00");
  });

  it("Monatsziel zählt nur Zahlungen des Zielmonats", () => {
    const goal = annualGoal({
      goalType: "monthly",
      month: 3,
      targetAmount: Money.fromString("1000.00", EUR),
    });
    const payments = [
      payment("2027-02-28", "500.00"),
      payment("2027-03-01", "400.00"),
      payment("2027-03-31", "300.00"),
      payment("2027-04-01", "900.00"),
    ];
    const progress = computeGoalProgress(goal, payments, {
      year: 2027,
      month: 3,
      day: 15,
    });
    expect(progress.actual.toStringValue()).toBe("700.00");
  });

  it("leerer Zeitraum ergibt 0 € und 0 %", () => {
    const progress = computeGoalProgress(annualGoal(), [], midYear);
    expect(progress.actual.isZero()).toBe(true);
    expect(progress.percent.toNumber()).toBe(0);
    expect(progress.remaining.toStringValue()).toBe("12000.00");
  });
});

describe("sortGoalProgress", () => {
  it("aktive/erreichte zuerst, dann bevorstehende, zuletzt beendete; jüngster Zeitraum zuerst", () => {
    const active = computeGoalProgress(
      annualGoal({ id: "active" }),
      [payment("2027-01-05", "1.00")],
      midYear,
    );
    const upcoming = computeGoalProgress(
      annualGoal({ id: "upcoming", year: 2029 }),
      [],
      midYear,
    );
    const endedOld = computeGoalProgress(
      annualGoal({ id: "ended-old", year: 2020 }),
      [payment("2020-01-05", "1.00")],
      midYear,
    );
    const endedNew = computeGoalProgress(
      annualGoal({ id: "ended-new", year: 2025 }),
      [payment("2025-01-05", "1.00")],
      midYear,
    );
    const sorted = sortGoalProgress([endedOld, upcoming, endedNew, active]);
    expect(sorted.map((p) => p.goal.id)).toEqual([
      "active",
      "upcoming",
      "ended-new",
      "ended-old",
    ]);
  });
});
