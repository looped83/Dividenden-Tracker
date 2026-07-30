import type { RefDate } from "@/lib/statistics";

/**
 * URL-Zustand des Vergleichsbereichs — rein, ohne React-Abhaengigkeit, damit
 * isoliert testbar (wie {@link ./filterParams}).
 *
 * Eigene Schluessel (`modus`, `basis`, `referenz`) statt des vorhandenen
 * `year`: Der Jahresfilter der Statistikleiste reduziert die Datenbasis auf
 * **ein** Jahr — mit ihm waere die Vergleichsseite grundsaetzlich leer. Beide
 * Jahre werden deshalb hier gewaehlt, und der Jahresfilter bleibt in diesem
 * Bereich unwirksam (die Oberflaeche sagt das ausdruecklich).
 */

export type ComparisonMode = "jahre" | "rollierend" | "monate";

export interface ComparisonSelection {
  mode: ComparisonMode;
  /** Die Seite, die im Vordergrund steht. */
  currentYear: number;
  /** Die Seite, gegen die verglichen wird. */
  referenceYear: number;
  /** Verglichener Kalendermonat (1..12) — nur im Modus „monate" wirksam. */
  month: number;
}

const MODES: readonly ComparisonMode[] = ["jahre", "rollierend", "monate"];

function parseMode(raw: string | null): ComparisonMode {
  return raw !== null && MODES.includes(raw as ComparisonMode)
    ? (raw as ComparisonMode)
    : "jahre";
}

/**
 * Waehlbare Monate. Im laufenden Jahr endet die Liste beim laufenden Monat:
 * Ein Monat, der noch nicht begonnen hat, ergaebe „0 € gegen 280 € — minus
 * 100 %". Das waere kein Rueckgang, sondern eine Falschaussage.
 */
export function comparisonMonthOptions(year: number, today: RefDate): number[] {
  const last = year === today.year ? today.month : 12;
  return Array.from({ length: last }, (_, index) => index + 1);
}

function parseMonth(raw: string | null, allowed: readonly number[]): number | null {
  if (raw === null || !/^\d{1,2}$/.test(raw)) return null;
  const month = Number.parseInt(raw, 10);
  return allowed.includes(month) ? month : null;
}

function parseYear(raw: string | null, allowed: readonly number[]): number | null {
  if (raw === null || !/^\d{4}$/.test(raw)) return null;
  const year = Number.parseInt(raw, 10);
  return allowed.includes(year) ? year : null;
}

/**
 * Waehlbare Jahre: alle Jahre mit Zahlungen, dazu das laufende Jahr und dessen
 * Vorjahr. Ohne die beiden liesse sich ein gerade begonnenes Jahr nicht gegen
 * das Vorjahr stellen — genau der Fall, in dem der Vergleich am meisten sagt.
 */
export function comparisonYearOptions(
  yearsWithPayments: readonly number[],
  today: RefDate,
): number[] {
  const years = new Set(yearsWithPayments);
  years.add(today.year);
  years.add(today.year - 1);
  return [...years].sort((a, b) => b - a);
}

/**
 * Liest die Auswahl aus der URL und faellt auf sinnvolle Vorgaben zurueck:
 * das jüngste Jahr gegen das naechstaeltere. Unbekannte oder nicht waehlbare
 * Werte werden still verworfen, statt eine leere Auswertung zu zeigen.
 *
 * `options` muss absteigend sortiert und nicht leer sein
 * ({@link comparisonYearOptions}).
 */
export function parseComparisonSelection(
  params: URLSearchParams,
  options: readonly number[],
  today: RefDate,
): ComparisonSelection {
  const defaultCurrent = options[0] ?? today.year;
  const currentYear = parseYear(params.get("basis"), options) ?? defaultCurrent;

  // Vorgabe fuer die Vergleichsseite ist das naechstaeltere waehlbare Jahr,
  // ersatzweise das Kalendervorjahr.
  const fallbackReference = options.find((year) => year < currentYear) ?? currentYear - 1;
  const parsedReference = parseYear(params.get("referenz"), options);
  const referenceYear =
    parsedReference !== null && parsedReference !== currentYear
      ? parsedReference
      : fallbackReference;

  // Vorgabe ist der laufende Monat; im laufenden Jahr wird er gekappt, sodass
  // nie ein Monat ausgewaehlt sein kann, der noch nicht begonnen hat.
  const monthOptions = comparisonMonthOptions(currentYear, today);
  const fallbackMonth = Math.min(today.month, monthOptions.length);
  const month = parseMonth(params.get("monat"), monthOptions) ?? fallbackMonth;

  return { mode: parseMode(params.get("modus")), currentYear, referenceYear, month };
}

/**
 * Schreibt die Auswahl in die URL. Geschrieben wird nur, was im jeweiligen
 * Modus auch wirkt: Im rollierenden Modus haben weder Jahre noch Monat eine
 * Bedeutung, im Jahresvergleich der Monat nicht. Eine Adresse soll nichts
 * tragen, das nichts bewirkt.
 */
export function applyComparisonSelection(
  params: URLSearchParams,
  selection: ComparisonSelection,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (selection.mode === "rollierend") {
    next.set("modus", "rollierend");
    next.delete("basis");
    next.delete("referenz");
    next.delete("monat");
    return next;
  }

  if (selection.mode === "monate") next.set("modus", "monate");
  else next.delete("modus");

  next.set("basis", String(selection.currentYear));
  next.set("referenz", String(selection.referenceYear));

  if (selection.mode === "monate") next.set("monat", String(selection.month));
  else next.delete("monat");

  return next;
}
