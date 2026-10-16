import { isoDate, lastDayOfMonth } from "@/lib/statistics";

/**
 * Monatsraster der Kalenderansicht.
 *
 * Reine Kalenderarithmetik auf ISO-Datumsstrings — kein `Date`-Parsing, keine
 * Zeitzone. Dieselbe Regel wie in `lib/statistics/dates.ts`: Ein Kalendertag
 * ist ein Tag, kein Zeitpunkt.
 */

/** Wochentage ab Montag (deutsche Kalenderkonvention). */
export const WEEKDAYS_DE_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

export const WEEKDAYS_DE = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

export interface CalendarDay {
  /** "YYYY-MM-DD". */
  date: string;
  /** Tag im Monat (1..31). */
  dayOfMonth: number;
  /** Index 0..6 ab Montag. */
  weekdayIndex: number;
  /** Gehoert der Tag zum dargestellten Monat oder fuellt er die Woche? */
  inMonth: boolean;
}

export interface MonthGrid {
  year: number;
  /** 1-basiert. */
  month: number;
  weeks: CalendarDay[][];
}

/** Wochentagsindex ab Montag (0 = Montag) fuer ein ISO-Datum. */
export function weekdayIndex(iso: string): number {
  const [year, month, day] = iso.split("-").map((part) => Number.parseInt(part, 10));
  // UTC, damit die Sommerzeit den Wochentag nicht verschiebt.
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (jsDay + 6) % 7;
}

/** Verschiebt ein reines Kalenderdatum um Tage. */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map((part) => Number.parseInt(part, 10));
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return isoDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/** Verschiebt Jahr/Monat um `delta` Monate (month 1-basiert). */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

/**
 * Baut das vollstaendige Raster eines Monats: immer ganze Wochen ab Montag,
 * mit den angeschnittenen Tagen der Nachbarmonate. Sechs Wochen nur dann, wenn
 * der Monat sie braucht — eine fest sechszeilige Ansicht liesse in kurzen
 * Monaten eine leere Zeile stehen.
 */
export function buildMonthGrid(year: number, month: number): MonthGrid {
  const firstOfMonth = isoDate(year, month, 1);
  const leading = weekdayIndex(firstOfMonth);
  const daysInMonth = lastDayOfMonth(year, month);
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];

  for (let index = 0; index < totalCells; index += 1) {
    const date = addDays(firstOfMonth, index - leading);
    const dayOfMonth = Number.parseInt(date.slice(8, 10), 10);
    week.push({
      date,
      dayOfMonth,
      weekdayIndex: index % 7,
      inMonth: index >= leading && index < leading + daysInMonth,
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  return { year, month, weeks };
}

/** Gruppiert Termine nach Kalendertag; die Reihenfolge je Tag bleibt erhalten. */
export function groupByDate<T extends { date: string }>(
  events: readonly T[],
): Map<string, T[]> {
  const byDate = new Map<string, T[]>();
  for (const event of events) {
    const bucket = byDate.get(event.date);
    if (bucket) bucket.push(event);
    else byDate.set(event.date, [event]);
  }
  return byDate;
}
