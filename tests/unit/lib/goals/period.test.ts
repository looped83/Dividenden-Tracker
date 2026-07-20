import { describe, expect, it } from "vitest";
import {
  annualPeriod,
  computeTimeProgress,
  goalPeriod,
  monthlyPeriod,
  timeStatus,
} from "@/lib/goals";
import type { RefDate } from "@/lib/statistics";

describe("goalPeriod", () => {
  it("Jahresziel umfasst das ganze Kalenderjahr", () => {
    expect(annualPeriod(2027)).toEqual({ start: "2027-01-01", end: "2027-12-31" });
    expect(goalPeriod({ goalType: "annual", year: 2027, month: null })).toEqual({
      start: "2027-01-01",
      end: "2027-12-31",
    });
  });

  it("Monatsziel umfasst den ganzen Monat", () => {
    expect(monthlyPeriod(2027, 3)).toEqual({ start: "2027-03-01", end: "2027-03-31" });
    expect(goalPeriod({ goalType: "monthly", year: 2027, month: 3 })).toEqual({
      start: "2027-03-01",
      end: "2027-03-31",
    });
  });

  it("Februar im Schaltjahr endet am 29., sonst am 28.", () => {
    expect(monthlyPeriod(2028, 2).end).toBe("2028-02-29"); // Schaltjahr
    expect(monthlyPeriod(2027, 2).end).toBe("2027-02-28"); // kein Schaltjahr
    expect(monthlyPeriod(2000, 2).end).toBe("2000-02-29"); // durch 400 teilbar
    expect(monthlyPeriod(1900, 2).end).toBe("1900-02-28"); // durch 100, nicht 400
  });
});

describe("timeStatus", () => {
  const period = annualPeriod(2027);
  it("bevorstehend, wenn der Zeitraum noch nicht begonnen hat", () => {
    expect(timeStatus(period, { year: 2026, month: 12, day: 31 })).toBe("upcoming");
  });
  it("laufend am ersten und letzten Tag", () => {
    expect(timeStatus(period, { year: 2027, month: 1, day: 1 })).toBe("current");
    expect(timeStatus(period, { year: 2027, month: 12, day: 31 })).toBe("current");
  });
  it("beendet nach dem Zeitraum", () => {
    expect(timeStatus(period, { year: 2028, month: 1, day: 1 })).toBe("ended");
  });
});

describe("computeTimeProgress (Jahresziel)", () => {
  it("beruecksichtigt Schaltjahre bei der Gesamtzahl der Tage", () => {
    expect(
      computeTimeProgress(annualPeriod(2028), { year: 2028, month: 6, day: 1 }).totalDays,
    ).toBe(366);
    expect(
      computeTimeProgress(annualPeriod(2027), { year: 2027, month: 6, day: 1 }).totalDays,
    ).toBe(365);
  });

  it("zaehlt den aktuellen Tag mit (inklusiv)", () => {
    const progress = computeTimeProgress(annualPeriod(2027), {
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(progress.elapsedDays).toBe(1);
    expect(progress.totalDays).toBe(365);
  });

  it("bevorstehend => 0 Tage, beendet => volle Tage", () => {
    const upcoming = computeTimeProgress(annualPeriod(2027), {
      year: 2026,
      month: 5,
      day: 5,
    });
    expect(upcoming.elapsedDays).toBe(0);
    expect(upcoming.percent.toNumber()).toBe(0);

    const ended = computeTimeProgress(annualPeriod(2027), {
      year: 2028,
      month: 1,
      day: 1,
    });
    expect(ended.elapsedDays).toBe(365);
    expect(ended.percent.toNumber()).toBe(100);
  });

  it("Mitte des Jahres ergibt rund 50 %", () => {
    // 1. Juli 2027 = Tag 182 von 365.
    const progress = computeTimeProgress(annualPeriod(2027), {
      year: 2027,
      month: 7,
      day: 1,
    });
    expect(progress.elapsedDays).toBe(182);
    expect(progress.percent.toNumber()).toBeCloseTo((182 / 365) * 100, 6);
  });
});

describe("computeTimeProgress (Monatsziel)", () => {
  it("nutzt die Monatslaenge als Gesamtzahl der Tage", () => {
    const feb: RefDate = { year: 2028, month: 2, day: 15 };
    const progress = computeTimeProgress(monthlyPeriod(2028, 2), feb);
    expect(progress.totalDays).toBe(29);
    expect(progress.elapsedDays).toBe(15);
  });

  it("beendeter Monat ergibt 100 %", () => {
    const progress = computeTimeProgress(monthlyPeriod(2027, 3), {
      year: 2027,
      month: 4,
      day: 1,
    });
    expect(progress.percent.toNumber()).toBe(100);
  });
});
