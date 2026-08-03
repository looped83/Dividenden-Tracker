import { monthNameDe } from "@/lib/statistics";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { WEEKDAYS_DE, weekdayIndex } from "./month";
import type { CalendarEvent } from "./types";

/**
 * Beschriftungen des Dividendenkalenders.
 *
 * Eine Stelle fuer alle Texte, die aus Daten entstehen — insbesondere die
 * zugaenglichen Bezeichnungen: Eine Kalenderzelle darf fuer eine Sprachausgabe
 * nicht nur „15" heiszen (Auftrag §16).
 */

const TIME = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

/** „Zahltag" / „Ex-Tag" — die Ereignisart in Worten. */
export function eventTypeLabel(event: CalendarEvent): string {
  return event.eventType === "ex_date" ? "Ex-Tag" : "Zahltag";
}

/** Titel eines Termins; ohne SUMMARY im Feed bleibt es bei „Ohne Titel". */
export function eventTitle(event: CalendarEvent): string {
  return event.title ?? "Ohne Titel";
}

/** „Montag, 13.08.2026". */
export function longDate(iso: string): string {
  return `${WEEKDAYS_DE[weekdayIndex(iso)]}, ${formatCalendarDate(iso)}`;
}

/** „13. August 2026" — ausgeschrieben fuer Sprachausgaben. */
export function spokenDate(iso: string): string {
  const day = Number.parseInt(iso.slice(8, 10), 10);
  const month = Number.parseInt(iso.slice(5, 7), 10);
  return `${String(day)}. ${monthNameDe(month)} ${iso.slice(0, 4)}`;
}

/** Uhrzeit eines Termins mit Zeitangabe, in Berliner Zeit. */
export function eventTime(event: CalendarEvent): string | null {
  if (event.isAllDay || !event.startsAt) return null;
  return `${TIME.format(new Date(event.startsAt))} Uhr`;
}

/** „2 angekündigte Zahltage" / „1 angekündigter Zahltag". */
export function eventCountLabel(count: number): string {
  return formatCountNoun(count, "angekündigter Zahltag", "angekündigte Zahltage");
}

/**
 * Bezeichnung einer Tageszelle fuer Sprachausgaben:
 * „13. August 2026, 2 angekündigte Zahltage" bzw. „…, keine Termine".
 */
export function dayCellLabel(iso: string, count: number, isToday: boolean): string {
  const parts = [spokenDate(iso)];
  if (isToday) parts.push("heute");
  parts.push(count === 0 ? "keine Termine" : eventCountLabel(count));
  return parts.join(", ");
}

/**
 * Zeitpunkt der letzten Aktualisierung, wie er neben dem Kalender steht:
 * „heute, 08:14 Uhr", „gestern, 21:03 Uhr", sonst mit Datum.
 */
export function lastSyncLabel(isoTimestamp: string, todayIso: string): string {
  const date = new Date(isoTimestamp);
  const time = `${TIME.format(date)} Uhr`;
  const day = calendarDayOf(date);
  if (day === todayIso) return `heute, ${time}`;
  if (day === previousDay(todayIso)) return `gestern, ${time}`;
  return `${formatCalendarDate(day)}, ${time}`;
}

const BERLIN_DAY = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Kalendertag, den ein Zeitpunkt in Berlin hat ("YYYY-MM-DD"). */
function calendarDayOf(date: Date): string {
  const parts = BERLIN_DAY.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function previousDay(iso: string): string {
  const [year, month, day] = iso.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day - 1));
  return date.toISOString().slice(0, 10);
}
