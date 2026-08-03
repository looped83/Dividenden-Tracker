import { addDays } from "./month";
import type { CalendarEvent } from "./types";

/**
 * Kennzahlen des Dividendenkalenders (Kachelzeile über der Liste).
 *
 * Ausschliesslich **abzaehlbare** Groessen: Anzahl Termine, Anzahl Unternehmen,
 * Abstand in Tagen. Betraege stehen bewusst nicht dabei — der Feed liefert
 * keine, und eine geschaetzte Zahl waere eine Behauptung (PRODUCT_SPEC.md
 * Grundsatz 8).
 *
 * Abgesagte Termine zaehlen nirgends mit: Sie sind gerade **keine**
 * angekuendigte Zahlung mehr. In der Liste bleiben sie sichtbar und sind dort
 * als abgesagt gekennzeichnet.
 */
export interface NextPayday {
  date: string;
  /** Kalendertage bis dahin; 0 = heute. */
  daysAway: number;
  /** Alle Termine dieses Tages, in der Reihenfolge der Liste. */
  events: CalendarEvent[];
}

export interface CalendarSummary {
  next: NextPayday | null;
  /** Termine im laufenden Kalendermonat (ganzer Monat, nicht nur ab heute). */
  thisMonth: number;
  /** Termine von heute bis einschliesslich in 30 Tagen. */
  next30Days: number;
  /** Verschiedene Unternehmen unter den kommenden Terminen. */
  companies: number;
  /** Kommende Termine insgesamt. */
  upcoming: number;
}

/** Kalendertage zwischen zwei ISO-Daten (zeitzonenfrei, ganze Tage). */
export function daysBetween(from: string, to: string): number {
  const parse = (iso: string): number => {
    const [year, month, day] = iso.split("-").map((part) => Number.parseInt(part, 10));
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

function isCounted(event: CalendarEvent): boolean {
  return event.eventState !== "cancelled";
}

export function buildCalendarSummary(
  events: readonly CalendarEvent[],
  today: string,
): CalendarSummary {
  const counted = events.filter(isCounted);
  const upcoming = counted
    .filter((event) => event.date >= today)
    .slice()
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));

  const nextDate = upcoming.length > 0 ? upcoming[0].date : null;
  const next: NextPayday | null =
    nextDate === null
      ? null
      : {
          date: nextDate,
          daysAway: daysBetween(today, nextDate),
          events: upcoming.filter((event) => event.date === nextDate),
        };

  const monthPrefix = today.slice(0, 7);
  const horizon = addDays(today, 30);

  return {
    next,
    thisMonth: counted.filter((event) => event.date.startsWith(monthPrefix)).length,
    next30Days: upcoming.filter((event) => event.date <= horizon).length,
    companies: new Set(upcoming.map((event) => event.title ?? "")).size,
    upcoming: upcoming.length,
  };
}
