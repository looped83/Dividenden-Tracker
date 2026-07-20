import { isoDate, lastDayOfMonth, type RefDate } from "@/lib/statistics";
import type { Goal, GoalPeriod, TimeStatus, TimeProgress } from "./types";
import { MoneyDecimal, type DecimalInstance } from "@/lib/money";

/** Inklusiver Zeitraum eines Jahresziels: 1. Januar bis 31. Dezember des Jahres. */
export function annualPeriod(year: number): GoalPeriod {
  return { start: isoDate(year, 1, 1), end: isoDate(year, 12, 31) };
}

/**
 * Inklusiver Zeitraum eines Monatsziels: 1. bis letzter Kalendertag des Monats.
 * Schaltjahre (Februar) werden ueber {@link lastDayOfMonth} korrekt beruecksichtigt.
 */
export function monthlyPeriod(year: number, month: number): GoalPeriod {
  return {
    start: isoDate(year, month, 1),
    end: isoDate(year, month, lastDayOfMonth(year, month)),
  };
}

/** Zielzeitraum eines Ziels je nach Zielart. */
export function goalPeriod(goal: Pick<Goal, "goalType" | "year" | "month">): GoalPeriod {
  if (goal.goalType === "monthly" && goal.month !== null) {
    return monthlyPeriod(goal.year, goal.month);
  }
  return annualPeriod(goal.year);
}

/** Anzahl Kalendertage eines Jahres (365 oder 366). */
function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Ordinaltag (1-basiert) eines Kalendertages im Jahr, Schaltjahr beruecksichtigt. */
function dayOfYear(ref: RefDate): number {
  let total = ref.day;
  for (let month = 1; month < ref.month; month += 1) {
    total += lastDayOfMonth(ref.year, month);
  }
  return total;
}

/** Reiner Kalendervergleich ref vs. Zeitraum; keine Zeitzonen-, keine Uhrzeitlogik. */
function refIsoDate(ref: RefDate): string {
  return isoDate(ref.year, ref.month, ref.day);
}

/**
 * Zeitfortschritt eines Zielzeitraums (Auftrag §12). Rein beschreibend:
 * vergangene Kalendertage geteilt durch die gesamten Kalendertage des Zeitraums.
 * Der aktuelle Tag wird — konsistent zur zentralen Datumsentscheidung der
 * Analytics-Schicht (YTD-/Monatszeitraeume inkl. heute) — mitgezaehlt.
 *
 * - Zeitraum noch nicht begonnen → 0 % (elapsed 0).
 * - Zeitraum vollstaendig vergangen → 100 % (elapsed = total).
 * - laufend → anteilig, decimal-sicher.
 *
 * Es findet KEINE Hochrechnung statt; der Wert ist ausschliesslich der
 * vergangene Zeitanteil.
 */
export function computeTimeProgress(period: GoalPeriod, ref: RefDate): TimeProgress {
  const status = timeStatus(period, ref);
  const isAnnual = period.start.slice(5) === "01-01" && period.end.slice(5) === "12-31";
  const year = Number.parseInt(period.start.slice(0, 4), 10);
  const month = Number.parseInt(period.start.slice(5, 7), 10);
  const totalDays = isAnnual ? daysInYear(year) : lastDayOfMonth(year, month);

  let elapsedDays: number;
  if (status === "upcoming") {
    elapsedDays = 0;
  } else if (status === "ended") {
    elapsedDays = totalDays;
  } else {
    elapsedDays = isAnnual ? dayOfYear(ref) : ref.day;
  }

  const percent: DecimalInstance =
    totalDays === 0
      ? new MoneyDecimal(0)
      : new MoneyDecimal(elapsedDays).div(totalDays).times(100);

  return { status, elapsedDays, totalDays, percent };
}

/** Reiner Zeitstatus eines Zeitraums relativ zum Referenztag. */
export function timeStatus(period: GoalPeriod, ref: RefDate): TimeStatus {
  const today = refIsoDate(ref);
  if (today < period.start) return "upcoming";
  if (today > period.end) return "ended";
  return "current";
}
