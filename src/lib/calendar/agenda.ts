import type { Money } from "@/lib/money";
import { monthNameDe } from "@/lib/statistics";
import { groupByDate } from "./month";
import { expectedTotalOf, isCounted } from "./summary";
import type { CalendarEvent } from "./types";

/**
 * Gliederung der Listenansicht (Auftrag §10): **je Monat ein Abschnitt**
 * („Oktober 2026") — dieselbe Gliederung wie die Dividendenliste.
 *
 * Bis 1.10 standen davor „Heute", „Diese Woche" und „Später im Oktober". Drei
 * Arten von Ueberschrift fuer eine Zeitachse lasen sich unruhig, und das
 * Datumsfeld jeder Zeile nennt den Tag ohnehin; der naechste Zahltag steht im
 * Kopf der Seite.
 *
 * Vergangene Termine erscheinen hier bewusst nicht: Die Liste beantwortet die
 * Frage „was kommt". Wer zurueckschauen will, blaettert im Monatsraster.
 */
export interface AgendaDay {
  date: string;
  events: CalendarEvent[];
}

export interface AgendaSection {
  /** Der Monat als „YYYY-MM". */
  key: string;
  label: string;
  days: AgendaDay[];
  /**
   * Summe der erwarteten Betraege des Abschnitts — dieselbe Regel wie im
   * Kennzahlkopf: ohne abgesagte Termine, leer ohne Betraege oder bei
   * verschiedenen Waehrungen (`expectedTotalOf`).
   */
  expected: Money | null;
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
 */
export function buildAgenda(
  events: readonly CalendarEvent[],
  today: string,
): AgendaSection[] {
  const upcoming = events
    .filter((event) => event.date >= today)
    .slice()
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));

  // Die Termine sind chronologisch sortiert, `groupByDate` behaelt diese
  // Reihenfolge bei — die Abschnitte entstehen dadurch bereits in der
  // richtigen Folge, ohne eigene Sortierung.
  const sections = new Map<string, Omit<AgendaSection, "expected">>();
  for (const [date, dayEvents] of groupByDate(upcoming)) {
    const key = date.slice(0, 7);
    const day = { date, events: dayEvents };
    const section = sections.get(key);
    if (section) section.days.push(day);
    else sections.set(key, { key, label: monthLabel(date), days: [day] });
  }

  return [...sections.values()].map((section) => ({
    ...section,
    expected: expectedTotalOf(section.days.flatMap((day) => day.events).filter(isCounted))
      .total,
  }));
}
