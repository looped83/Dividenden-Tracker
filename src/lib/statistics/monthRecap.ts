import type { Money } from "@/lib/money";
import {
  aggregate,
  aggregateInRange,
  distinctSecurities,
  groupBySecurity,
  rankGroups,
} from "./analytics";
import {
  isInRange,
  isoDate,
  lastDayOfMonth,
  type DateRange,
  type RefDate,
} from "./dates";
import type { AnalyticsPayment } from "./types";

/**
 * Monatsabschluss auf der Startseite (CALCULATION_RULES.md §11.13): das
 * Ergebnis des Vormonats in einer Karte, nur in den ersten Tagen eines Monats.
 * Reine Funktion ueber denselben Eingaengen wie alle Kennzahlen (effektives
 * Datum, §10); das Monatsziel bewertet der Aufrufer ueber die Zielschicht.
 */

/** Bis zu diesem Monatstag steht der Abschluss des Vormonats auf der Startseite. */
const RECAP_UNTIL_DAY = 7;

export interface MonthRecap {
  year: number;
  month: number;
  net: Money;
  count: number;
  /** Zahl verschiedener Assets mit Zahlung im Monat. */
  assets: number;
  /** Ganzer Vorjahresmonat zum Vergleich. */
  priorNet: Money;
  /** Staerkster Zahler des Monats (§9-Rangfolge); null ohne Zahlungen. */
  top: { securityId: string; net: Money } | null;
}

/** Der abgeschlossene Monat, dessen Abschluss gerade dran ist, oder null. */
export function recapMonth(ref: RefDate): { year: number; month: number } | null {
  // Im Januar steht der Jahresrueckblick auf der Startseite (bis 10.1.); ein
  // Dezemberabschluss daneben erzaehlte dasselbe zweimal.
  if (ref.day > RECAP_UNTIL_DAY || ref.month === 1) return null;
  return { year: ref.year, month: ref.month - 1 };
}

function wholeMonth(year: number, month: number): DateRange {
  return {
    start: isoDate(year, month, 1),
    end: isoDate(year, month, lastDayOfMonth(year, month)),
  };
}

/**
 * Kennzahlen des Vormonats, wenn er gerade dran ist (siehe {@link recapMonth}).
 * `labelOf` entscheidet Gleichstaende beim staerksten Zahler nach Namen.
 */
export function monthRecap(
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
  labelOf?: (securityId: string) => string,
): MonthRecap | null {
  const target = recapMonth(ref);
  if (target === null) return null;
  const { year, month } = target;
  const range = wholeMonth(year, month);
  const inMonth = payments.filter((p) => isInRange(p.payDate, range));
  const { net, count } = aggregate(inMonth);
  const best = rankGroups(groupBySecurity(inMonth), labelOf).at(0);
  return {
    year,
    month,
    net,
    count,
    assets: distinctSecurities(inMonth),
    priorNet: aggregateInRange(payments, wholeMonth(year - 1, month)).net,
    top: best ? { securityId: best.key, net: best.net } : null,
  };
}
