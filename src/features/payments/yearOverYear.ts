import { Money } from "@/lib/money";
import { monthOf, yearOf } from "@/lib/statistics";

/** Richtung gegenueber der Vergleichszahlung des Vorjahres. */
export type YearOverYearDirection = "up" | "down" | "same";

export interface YearOverYearEntry {
  id: string;
  securityId: string;
  /** Effektives Zahlungsdatum (Ausschuettungsplan bereits beruecksichtigt, §10). */
  effectiveDate: string;
  amount: Money;
  /** Stornierte Eingaenge zaehlen weder als Bezug noch erhalten sie einen. */
  cancelled: boolean;
}

export interface YearOverYearComparison {
  direction: YearOverYearDirection;
  /** Betrag der Vergleichszahlung. */
  previousAmount: Money;
  /** Effektives Datum der Vergleichszahlung. */
  previousDate: string;
  /** Vorzeichenbehaftete Differenz (aktuell − Vorjahr). */
  difference: Money;
}

function bucketKey(securityId: string, year: number, month: number): string {
  return `${securityId}|${String(year)}-${String(month)}`;
}

/**
 * Stellt jede Zahlung der Zahlung desselben **effektiven Ausschuettungsmonats**
 * im Vorjahr gegenueber — je Unternehmen, depotuebergreifend.
 *
 * Der effektive Monat ist kein blosser Kalendermonat: Bei hinterlegtem
 * Ausschuettungsplan ordnet §10 jede Zahlung ihrem geplanten Monat zu, auch
 * ueber den Jahreswechsel (Zahlung am 2. April bei Plan Maerz -> Maerz). Der
 * Monat ist damit der Ausschuettungs-Slot und ueber Jahre stabil.
 *
 * Warum nicht die Reihenfolge im Jahr: Faellt eine Zahlung aus, verschoebe sie
 * jeden folgenden Vergleich des Jahres — aus einem ausgesetzten Maerzquartal
 * wuerden drei falsche Vergleiche. Ueber den Monat bleibt der Fehler an der
 * einen Zahlung: Fuer den ausgefallenen Monat gibt es keinen Vergleich, die
 * uebrigen stimmen weiter.
 *
 * Kein Vergleich (und damit kein Indikator) entsteht, wenn
 * - im Vorjahresmonat keine Zahlung steht (erstes Jahr, neue Position,
 *   ausgesetzte Dividende, ungepflegter Ausschuettungsplan bei verschobenem
 *   Termin),
 * - auf einer der beiden Seiten mehrere Zahlungen in denselben Monat fallen
 *   (Nachzahlung, Sonderdividende) — welche zu welcher gehoert, ist dann nicht
 *   entscheidbar,
 * - die Waehrungen der beteiligten Depots verschieden sind; ohne Kurs zum
 *   Zahlungszeitpunkt waere jeder Vergleich geraten (R-2).
 *
 * Verglichen werden Betraege, nicht Dividenden je Aktie: Stueckzahl und
 * Betrag/Aktie sind bei manuell erfassten Eingaengen leer. Ein Zukauf hebt den
 * Betrag also, ohne dass das Unternehmen die Dividende erhoeht haette.
 */
export function compareToPreviousYear(
  entries: readonly YearOverYearEntry[],
): Map<string, YearOverYearComparison> {
  const buckets = new Map<string, YearOverYearEntry[]>();
  for (const entry of entries) {
    if (entry.cancelled) continue;
    const key = bucketKey(
      entry.securityId,
      yearOf(entry.effectiveDate),
      monthOf(entry.effectiveDate),
    );
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }

  const result = new Map<string, YearOverYearComparison>();
  for (const bucket of buckets.values()) {
    if (bucket.length !== 1) continue;
    const entry = bucket[0];
    const month = monthOf(entry.effectiveDate);
    const previousBucket = buckets.get(
      bucketKey(entry.securityId, yearOf(entry.effectiveDate) - 1, month),
    );
    if (previousBucket?.length !== 1) continue;

    const reference = previousBucket[0];
    if (reference.amount.currency !== entry.amount.currency) continue;

    const comparison = entry.amount.compareTo(reference.amount);
    result.set(entry.id, {
      direction: comparison > 0 ? "up" : comparison < 0 ? "down" : "same",
      previousAmount: reference.amount,
      previousDate: reference.effectiveDate,
      difference: entry.amount.subtract(reference.amount),
    });
  }

  return result;
}
