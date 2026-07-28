import { Money } from "@/lib/money";
import { yearOf } from "@/lib/statistics";

/** Richtung gegenueber der Vergleichszahlung des Vorjahres. */
export type YearOverYearDirection = "up" | "down" | "same";

export interface YearOverYearEntry {
  id: string;
  securityId: string;
  /** Effektives Zahlungsdatum (Ausschuettungsplan bereits beruecksichtigt). */
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

/**
 * Stellt jede Zahlung der Zahlung gleicher Reihenfolge im Vorjahr gegenueber:
 * die erste Zahlung eines Jahres der ersten des Vorjahres, die zweite der
 * zweiten und so fort — je Unternehmen, depotuebergreifend.
 *
 * Warum die Reihenfolge und nicht der Kalendermonat: Zahlungstermine
 * verschieben sich (Hauptversammlung, Feiertage, Wertstellung). Ein Vergleich
 * ueber den Monat faende bei einem Jahreszahler, der einmal Anfang Mai und
 * einmal Ende April zahlt, gar kein Gegenstueck. Die Reihenfolge ist stabil,
 * solange die Zahl der Zahlungen je Jahr gleich bleibt; faellt eine Zahlung
 * aus, verschiebt sich der Bezug — deshalb nennt die Anzeige immer das Datum
 * der Vergleichszahlung.
 *
 * Verglichen werden Betraege, nicht Dividenden je Aktie: Stueckzahl und
 * Betrag/Aktie sind bei manuell erfassten Eingaengen leer. Ein Zukauf hebt den
 * Betrag also, ohne dass das Unternehmen die Dividende erhoeht haette.
 *
 * Ohne Gegenstueck (erstes Jahr, neue Position, unterschiedliche Waehrungen)
 * entsteht kein Eintrag — die Liste zeigt dann keinen Indikator statt einer
 * erfundenen Aussage.
 */
export function compareToPreviousYear(
  entries: readonly YearOverYearEntry[],
): Map<string, YearOverYearComparison> {
  const result = new Map<string, YearOverYearComparison>();

  const bySecurity = new Map<string, YearOverYearEntry[]>();
  for (const entry of entries) {
    if (entry.cancelled) continue;
    const list = bySecurity.get(entry.securityId);
    if (list) list.push(entry);
    else bySecurity.set(entry.securityId, [entry]);
  }

  for (const list of bySecurity.values()) {
    const byYear = new Map<number, YearOverYearEntry[]>();
    for (const entry of list) {
      const year = yearOf(entry.effectiveDate);
      const yearList = byYear.get(year);
      if (yearList) yearList.push(entry);
      else byYear.set(year, [entry]);
    }

    // Stabile Reihenfolge: Datum, bei gleichem Datum die Kennung — sonst haenge
    // der Bezug an der Reihenfolge, in der die Datenbank geliefert hat.
    for (const yearList of byYear.values()) {
      yearList.sort((a, b) =>
        a.effectiveDate === b.effectiveDate
          ? a.id.localeCompare(b.id)
          : a.effectiveDate.localeCompare(b.effectiveDate),
      );
    }

    for (const [year, yearList] of byYear) {
      const previousYear = byYear.get(year - 1);
      if (!previousYear) continue;

      yearList.forEach((entry, index) => {
        // `at` statt Index: Das Vorjahr kann weniger Zahlungen haben, und die
        // Projektkonfiguration typisiert den Indexzugriff nicht als optional.
        const reference = previousYear.at(index);
        if (!reference) return;
        // Depotuebergreifend koennen Depots verschiedene Basiswaehrungen haben.
        // Ohne Kurs zum Zahlungszeitpunkt waere jeder Vergleich geraten.
        if (reference.amount.currency !== entry.amount.currency) return;

        const comparison = entry.amount.compareTo(reference.amount);
        result.set(entry.id, {
          direction: comparison > 0 ? "up" : comparison < 0 ? "down" : "same",
          previousAmount: reference.amount,
          previousDate: reference.effectiveDate,
          difference: entry.amount.subtract(reference.amount),
        });
      });
    }
  }

  return result;
}
