import { addDays, groupByDate, weekdayIndex } from "./month";
import type { CalendarEvent } from "./types";

/**
 * Gliederung der Listenansicht (Auftrag §10).
 *
 * Drei Abschnitte statt einer endlosen Liste: „Heute", „Diese Woche" und
 * „Später". Der Rest der laufenden Woche endet am Sonntag — die deutsche
 * Kalenderwoche, dieselbe wie im Monatsraster.
 *
 * Vergangene Termine erscheinen hier bewusst nicht: Die Liste beantwortet die
 * Frage „was kommt". Wer zurueckschauen will, blaettert im Monatsraster.
 */
export type AgendaSectionKey = "today" | "week" | "later";

export interface AgendaDay {
  date: string;
  events: CalendarEvent[];
}

export interface AgendaSection {
  key: AgendaSectionKey;
  label: string;
  days: AgendaDay[];
}

const LABELS: Record<AgendaSectionKey, string> = {
  today: "Heute",
  week: "Diese Woche",
  later: "Später",
};

function sectionFor(date: string, today: string, endOfWeek: string): AgendaSectionKey {
  if (date === today) return "today";
  return date <= endOfWeek ? "week" : "later";
}

/**
 * Baut die Abschnitte der Listenansicht. `today` ist ein reines Kalenderdatum;
 * Vergleiche laufen lexikografisch auf dem ISO-Format (fuer "YYYY-MM-DD"
 * identisch zum chronologischen Vergleich).
 */
export function buildAgenda(
  events: readonly CalendarEvent[],
  today: string,
): AgendaSection[] {
  const endOfWeek = addDays(today, 6 - weekdayIndex(today));
  const upcoming = events
    .filter((event) => event.date >= today)
    .slice()
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));

  const byDate = groupByDate(upcoming);
  const sections = new Map<AgendaSectionKey, AgendaDay[]>();

  for (const [date, dayEvents] of byDate) {
    const key = sectionFor(date, today, endOfWeek);
    const days = sections.get(key);
    if (days) days.push({ date, events: dayEvents });
    else sections.set(key, [{ date, events: dayEvents }]);
  }

  return (["today", "week", "later"] as const)
    .map((key) => ({ key, label: LABELS[key], days: sections.get(key) ?? [] }))
    .filter((section) => section.days.length > 0);
}
