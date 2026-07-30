/**
 * Datumsdarstellung der gesamten Anwendung: **immer** `29.07.2026`.
 *
 * Eine Stelle, ein Format. `toLocaleDateString("de-DE")` schreibt je nach
 * Wert `29.7.2026` oder `01.12.2026` — nebeneinander in einer Tabelle sieht
 * das nach zwei verschiedenen Feldern aus, und Spalten mit gemischter Breite
 * lassen sich schlechter überfliegen. Zweistellig ist außerdem in Belegen und
 * Kontoauszügen üblich.
 */

const DATE = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Reines Kalenderdatum („YYYY-MM-DD") als `29.07.2026`.
 *
 * Ohne Zeitzonenbezug interpretiert: `new Date("2026-07-29")` liest den String
 * als UTC-Mitternacht und läge westlich von Greenwich einen Tag daneben. Ein
 * `pay_date` ist ein Kalendertag, kein Zeitpunkt.
 */
export function formatCalendarDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return DATE.format(new Date(year, month - 1, day));
}

/** Zeitpunkt (ISO mit Uhrzeit, z. B. `created_at`) als Datum: `29.07.2026`. */
export function formatTimestampDate(value: string | Date): string {
  return DATE.format(typeof value === "string" ? new Date(value) : value);
}

/** Zeitpunkt mit Uhrzeit: `29.07.2026, 14:05`. */
export function formatTimestamp(value: string | Date): string {
  return DATE_TIME.format(typeof value === "string" ? new Date(value) : value);
}
