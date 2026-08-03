/**
 * Datums- und Zeitzonenhilfen der Kalendersynchronisation.
 *
 * Bewusst ohne Abhaengigkeit und ohne `Date`-Parsing aus Strings: Ein
 * Kalendertag ist ein Tag, kein Zeitpunkt. Genau daran scheitern iCal-
 * Integrationen regelmaessig — ein ganztaegiger Termin wird als UTC-Mitternacht
 * gelesen und erscheint oestlich/westlich von Greenwich einen Tag daneben
 * (Auftrag §14). Dieselbe Regel gilt in der App bereits fuer `pay_date`
 * (src/lib/statistics/dates.ts).
 */

/** Fuer die Anzeige maszgebliche Zeitzone (Auftrag §14). */
export const DISPLAY_TIME_ZONE = "Europe/Berlin";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Bildet ein ISO-Kalenderdatum "YYYY-MM-DD" (month 1-basiert). */
export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/** True, wenn die Zeitzonenkennung von der Laufzeit aufgeloest werden kann. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const PART_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = PART_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    PART_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

/** Zerlegt einen Zeitpunkt in die Kalenderfelder einer Zeitzone. */
function partsInZone(epochMs: number, timeZone: string): ZoneParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(epochMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? "0";
    return Number.parseInt(value, 10);
  };
  // `hour12: false` liefert in manchen ICU-Fassungen 24 statt 0 fuer Mitternacht.
  const hour = read("hour") % 24;
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour,
    minute: read("minute"),
    second: read("second"),
  };
}

/** Verschiebung einer Zeitzone gegen UTC (in Millisekunden) zu einem Zeitpunkt. */
function zoneOffsetMs(epochMs: number, timeZone: string): number {
  const parts = partsInZone(epochMs, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // Millisekunden gehen bei der Zerlegung verloren; der Vergleich laeuft
  // deshalb auf ganzen Sekunden, damit der Versatz ein glattes Vielfaches von
  // Minuten bleibt.
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/**
 * Rechnet eine Wanduhrzeit einer Zeitzone in einen absoluten Zeitpunkt um.
 *
 * Zwei Durchgaenge, weil die Verschiebung selbst vom Ergebnis abhaengt
 * (Sommerzeit): Der erste Durchgang schaetzt mit der Verschiebung an der
 * UTC-Interpretation, der zweite korrigiert sie am geschaetzten Zeitpunkt.
 * Damit sind alle Faelle ausser den zwei mehrdeutigen Stunden der Umstellung
 * exakt; dort wird — wie in der ECMAScript-Spezifikation — die frueheste
 * gueltige Lesart gewaehlt.
 */
export function wallClockToInstant(parts: ZoneParts, timeZone: string): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const firstGuess = naive - zoneOffsetMs(naive, timeZone);
  const corrected = naive - zoneOffsetMs(firstGuess, timeZone);
  return new Date(corrected);
}

/** Kalendertag ("YYYY-MM-DD"), den ein Zeitpunkt in einer Zeitzone hat. */
export function calendarDayInZone(date: Date, timeZone: string): string {
  const parts = partsInZone(date.getTime(), timeZone);
  return isoDate(parts.year, parts.month, parts.day);
}

/** Verschiebt ein reines Kalenderdatum um Tage (zeitzonenfrei). */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error("Ungueltiges Kalenderdatum");
  }
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return isoDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}
