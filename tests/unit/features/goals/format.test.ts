import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import { computeGoalProgress, type Goal } from "@/lib/goals";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";
import {
  accessibleProgressLabel,
  autoGoalTitle,
  cappedBarPercent,
  drillDownHref,
  goalDisplayTitle,
  periodLabel,
  remainderText,
  startsAtLabel,
  timeProgressText,
} from "@/features/goals/format";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g",
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

function payment(payDate: string, net: string): AnalyticsPayment {
  return {
    id: payDate,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: "s",
    depotId: "d",
    paymentType: "regular",
    source: "manual",
    createdAt: "2027-01-01T00:00:00Z",
  };
}

const midYear: RefDate = { year: 2027, month: 7, day: 1 };

/** Intl fügt zwischen Betrag und € geschützte Leerzeichen ein; für den
 * Textvergleich auf normale Leerzeichen normalisieren. */
function norm(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, " ");
}

describe("Zieltitel und Zeitraumbeschriftung", () => {
  it("automatische Titel", () => {
    expect(autoGoalTitle(goal())).toBe("Dividendenziel 2027");
    expect(autoGoalTitle(goal({ goalType: "monthly", month: 3 }))).toBe(
      "Monatsziel März 2027",
    );
  });
  it("eigener Titel hat Vorrang", () => {
    expect(goalDisplayTitle(goal({ title: "Mein Ziel" }))).toBe("Mein Ziel");
    expect(goalDisplayTitle(goal({ title: "  " }))).toBe("Dividendenziel 2027");
  });
  it("Zeitraum- und Beginn-Beschriftung", () => {
    expect(periodLabel(goal({ goalType: "monthly", month: 12 }))).toBe("Dezember 2027");
    expect(startsAtLabel(goal({ year: 2028 }))).toBe("Beginnt am 01.01.2028");
    expect(startsAtLabel(goal({ goalType: "monthly", month: 12, year: 2027 }))).toBe(
      "Beginnt im Dezember 2027",
    );
  });
});

describe("Restbetrag- und Fortschrittstexte", () => {
  it("verbleibender Betrag unter dem Ziel", () => {
    const progress = computeGoalProgress(
      goal(),
      [payment("2027-03-01", "9000.00")],
      midYear,
    );
    expect(norm(remainderText(progress))).toBe("Noch 3.000,00 € bis zum Ziel");
  });
  it("Ziel erreicht ohne negativen Restbetrag", () => {
    const progress = computeGoalProgress(
      goal(),
      [payment("2027-03-01", "12000.00")],
      midYear,
    );
    expect(norm(remainderText(progress))).toBe("Ziel erreicht");
  });
  it("Überschreitung wird beziffert", () => {
    const progress = computeGoalProgress(
      goal(),
      [payment("2027-03-01", "13200.00")],
      midYear,
    );
    expect(norm(remainderText(progress))).toBe("Ziel um 1.200,00 € übertroffen");
  });
  it("zugängliche Fortschrittsbeschriftung nennt Beträge und Prozent", () => {
    const progress = computeGoalProgress(
      goal(),
      [payment("2027-03-01", "9000.00")],
      midYear,
    );
    expect(norm(accessibleProgressLabel(progress))).toBe(
      "9.000,00 € von 12.000,00 € erreicht, entsprechend 75,0 %",
    );
  });
  it("zugängliche Beschriftung ergänzt Überschreitung", () => {
    const progress = computeGoalProgress(
      goal(),
      [payment("2027-03-01", "13200.00")],
      midYear,
    );
    expect(norm(accessibleProgressLabel(progress))).toBe(
      "13.200,00 € von 12.000,00 € erreicht, entsprechend 110,0 %; Ziel um 1.200,00 € übertroffen",
    );
  });
});

describe("Fortschrittsbalken-Begrenzung und Zeitfortschritt", () => {
  it("Balken ist bei über 100 % visuell begrenzt", () => {
    const progress = computeGoalProgress(
      goal(),
      [payment("2027-03-01", "24000.00")],
      midYear,
    );
    expect(progress.percent.toNumber()).toBeCloseTo(200, 6);
    expect(cappedBarPercent(progress.percent)).toBe(100);
  });
  it("Zeitfortschritt ist rein beschreibend", () => {
    const progress = computeGoalProgress(goal(), [], midYear);
    // 1. Juli 2027 = Tag 182 von 365 ~ 50 %.
    expect(timeProgressText(progress)).toBe("50 % des Jahres vergangen");
  });
});

describe("Drill-down", () => {
  it("Jahresziel verlinkt auf das Jahr", () => {
    expect(drillDownHref(goal())).toBe("/eingaenge?year=2027");
  });
  it("Monatsziel verlinkt auf Jahr und Monat", () => {
    expect(drillDownHref(goal({ goalType: "monthly", month: 3 }))).toBe(
      "/eingaenge?year=2027&month=3",
    );
  });
});
