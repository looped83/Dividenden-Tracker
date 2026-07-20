/**
 * Datums- und Zeitraumlogik der Analytics-Schicht (Phase 5A, CALCULATION_RULES.md §9).
 *
 * Grundsaetze:
 * - `pay_date` ist ein reines Kalenderdatum ("YYYY-MM-DD"); es findet keine
 *   Zeitzonen-Umrechnung statt. Jahr/Monat/Tag werden per String-Zerlegung
 *   gewonnen, Bereichsvergleiche laufen lexikografisch auf dem ISO-Format
 *   (fuer festes "YYYY-MM-DD" identisch zum chronologischen Vergleich).
 * - Der Referenzzeitpunkt "heute" wird als reines Kalendertripel {year, month,
 *   day} durchgereicht (month 1-basiert). Dadurch sind alle Berechnungen
 *   deterministisch testbar und unabhaengig von der lokalen Zeitzone.
 */

/** Kalendertripel; `month` ist 1-basiert (1 = Januar). */
export interface RefDate {
  year: number;
  month: number;
  day: number;
}

/** Leitet ein Kalendertripel aus einem Date ab (lokale Kalenderfelder). */
export function refDateFromDate(date: Date = new Date()): RefDate {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Bildet ein ISO-Kalenderdatum "YYYY-MM-DD" (month 1-basiert). */
export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

export function isoFromRef(ref: RefDate): string {
  return isoDate(ref.year, ref.month, ref.day);
}

/** Letzter Kalendertag eines Monats (month 1-basiert); beruecksichtigt Schaltjahre. */
export function lastDayOfMonth(year: number, month: number): number {
  // Date.UTC(year, month, 0) liefert den letzten Tag des 1-basierten `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Entsprechender Kalendertag im Vorjahr (R-6.6/§9): gleicher Monat und Tag,
 * ein Jahr zurueck. Besitzt der Vorjahresmonat weniger Tage (29.02. im
 * Nicht-Schaltjahr), wird auf den letzten gueltigen Tag dieses Monats
 * abgebildet (28.02.).
 */
export function priorYearSameDay(ref: RefDate): string {
  const priorYear = ref.year - 1;
  const day = Math.min(ref.day, lastDayOfMonth(priorYear, ref.month));
  return isoDate(priorYear, ref.month, day);
}

/** Inklusiver Datumsbereich (ISO-Strings). */
export interface DateRange {
  start: string;
  end: string;
}

/** Ganzes Kalenderjahr als inklusiver Bereich. */
export function yearRange(year: number): DateRange {
  return { start: isoDate(year, 1, 1), end: isoDate(year, 12, 31) };
}

/**
 * Jahr-bis-heute (YTD): 1. Januar bis zum Referenztag des gleichen Jahres.
 * Fuer abgeschlossene Jahre ist `ref` der 31.12. dieses Jahres.
 */
export function ytdRange(year: number, ref: RefDate): DateRange {
  const end = year === ref.year ? isoFromRef(ref) : isoDate(year, 12, 31);
  return { start: isoDate(year, 1, 1), end };
}

/** Aktueller Monat bis heute: 1. des Referenzmonats bis Referenztag. */
export function monthToDateRange(ref: RefDate): DateRange {
  return { start: isoDate(ref.year, ref.month, 1), end: isoFromRef(ref) };
}

/**
 * Gleicher Monatszeitraum im Vorjahr (§6.3): 1. desselben Monats im Vorjahr
 * bis zum entsprechenden Kalendertag (Kappung bei kuerzerem Monat).
 */
export function priorYearMonthToDateRange(ref: RefDate): DateRange {
  const priorYear = ref.year - 1;
  const day = Math.min(ref.day, lastDayOfMonth(priorYear, ref.month));
  return {
    start: isoDate(priorYear, ref.month, 1),
    end: isoDate(priorYear, ref.month, day),
  };
}

/** True, wenn `iso` (YYYY-MM-DD) inklusive innerhalb des Bereichs liegt. */
export function isInRange(iso: string, range: DateRange): boolean {
  return iso >= range.start && iso <= range.end;
}

/** Jahresanteil eines ISO-Datums ohne Date-Parsing (zeitzonensicher). */
export function yearOf(iso: string): number {
  return Number.parseInt(iso.slice(0, 4), 10);
}

/** Monatsanteil (1-basiert) eines ISO-Datums ohne Date-Parsing. */
export function monthOf(iso: string): number {
  return Number.parseInt(iso.slice(5, 7), 10);
}

/** Deutsche Monatsnamen (Index 0 = Januar), lang. */
export const MONTH_NAMES_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

/** Deutsche Monatsnamen kurz (Index 0 = Jan). */
export const MONTH_NAMES_DE_SHORT = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

/** Langer deutscher Monatsname fuer month 1..12. */
export function monthNameDe(month: number): string {
  return MONTH_NAMES_DE[month - 1] ?? "";
}

/** Kurzer deutscher Monatsname fuer month 1..12. */
export function monthNameDeShort(month: number): string {
  return MONTH_NAMES_DE_SHORT[month - 1] ?? "";
}
