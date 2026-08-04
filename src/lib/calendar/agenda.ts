import { monthNameDe } from "@/lib/statistics";
import { addDays, groupByDate, weekdayIndex } from "./month";
import type { CalendarEvent } from "./types";

/**
 * Gliederung der Listenansicht (Auftrag §10).
 *
 * „Heute", „Diese Woche", „Später" — und danach **je Monat ein eigener
 * Abschnitt**. „Später" trug zuvor alles, was nach dieser Woche kam: In einem
 * gut gefuellten Kalender standen darin die Termine eines halben Jahres
 * untereinander, ohne dass ein Monatswechsel sichtbar wurde. Jetzt endet
 * „Später" mit dem laufenden Monat, und jeder folgende Monat traegt seine
 * eigene Ueberschrift („September 2026").
 *
 * Vergangene Termine erscheinen hier bewusst nicht: Die Liste beantwortet die
 * Frage „was kommt". Wer zurueckschauen will, blaettert im Monatsraster.
 */
export interface AgendaDay {
  date: string;
  events: CalendarEvent[];
}

export interface AgendaSection {
  /**
   * Stabiler Schluessel: „today", „week", „later" — oder der Monat als
   * „YYYY-MM" fuer die Abschnitte danach.
   */
  key: string;
  label: string;
  days: AgendaDay[];
}

/** „September 2026" aus einem ISO-Datum. */
function monthLabel(date: string): string {
  const year = date.slice(0, 4);
  const month = Number.parseInt(date.slice(5, 7), 10);
  return `${monthNameDe(month)} ${year}`;
}

/**
 * Baut die Abschnitte der Listenansicht. `today` ist ein reines Kalenderdatum;
 * Vergleiche laufen lexikografisch auf dem ISO-Format (fuer "YYYY-MM-DD"
 * identisch zum chronologischen Vergleich).
 *
 * Die Woche endet am Sonntag — die deutsche Kalenderwoche, dieselbe wie im
 * Monatsraster. Reicht sie in den naechsten Monat hinein, gehoeren diese Tage
 * zu „Diese Woche": Der erste passende Abschnitt gewinnt.
 */
export function buildAgenda(
  events: readonly CalendarEvent[],
  today: string,
): AgendaSection[] {
  const endOfWeek = addDays(today, 6 - weekdayIndex(today));
  const currentMonth = today.slice(0, 7);
  const upcoming = events
    .filter((event) => event.date >= today)
    .slice()
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));

  // Die Termine sind chronologisch sortiert, `groupByDate` behaelt diese
  // Reihenfolge bei — die Abschnitte entstehen dadurch bereits in der
  // richtigen Folge, ohne eigene Sortierung.
  const sections = new Map<string, AgendaSection>();
  const add = (key: string, label: string, day: AgendaDay) => {
    const section = sections.get(key);
    if (section) section.days.push(day);
    else sections.set(key, { key, label, days: [day] });
  };

  for (const [date, dayEvents] of groupByDate(upcoming)) {
    const day = { date, events: dayEvents };
    if (date === today) add("today", "Heute", day);
    else if (date <= endOfWeek) add("week", "Diese Woche", day);
    else if (date.slice(0, 7) === currentMonth) add("later", "Später", day);
    else add(date.slice(0, 7), monthLabel(date), day);
  }

  return [...sections.values()];
}
