import { isoDate, lastDayOfMonth, monthOf, yearOf } from "./dates";
import type { AnalyticsPayment } from "./types";

/**
 * Effektives Zahlungsdatum fuer Auswertungen (CALCULATION_RULES.md §10).
 *
 * Ist fuer ein Unternehmen ein Ausschuettungsplan (`payoutMonths`, Werte 1..12)
 * hinterlegt, wird eine Zahlung dem **naechstliegenden** geplanten Monat
 * zugeordnet — auch ueber den Jahreswechsel hinweg (eine Anfang-Januar-Zahlung
 * fuer eine Dezember-Ausschuettung zaehlt im Dezember des Vorjahres). Bei
 * Gleichstand gewinnt der fruehere Monat (Dividenden treffen eher spaeter als
 * frueher ein). Ohne Plan bleibt das echte Zahlungsdatum unveraendert.
 *
 * Der Tag wird aus dem echten Datum uebernommen und auf die Monatslaenge
 * begrenzt; er dient nur der internen Datumsdarstellung, nicht der Zuordnung.
 * Reine Funktion, keine Gleitkomma-Geldarithmetik.
 */
export function effectivePayDate(
  payDate: string,
  payoutMonths: readonly number[] | null | undefined,
): string {
  const months = normalizePayoutMonths(payoutMonths);
  if (months.length === 0) return payDate;

  const year = yearOf(payDate);
  const month = monthOf(payDate);
  const day = Number.parseInt(payDate.slice(8, 10), 10);
  const actualIndex = year * 12 + (month - 1); // absoluter Monatsindex

  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const planned of months) {
    for (const yearOffset of [-1, 0, 1]) {
      const candidateIndex = (year + yearOffset) * 12 + (planned - 1);
      const distance = Math.abs(candidateIndex - actualIndex);
      if (
        distance < bestDistance ||
        // Gleichstand: frueheren Monat bevorzugen (kleinerer Index).
        (distance === bestDistance && bestIndex !== null && candidateIndex < bestIndex)
      ) {
        bestDistance = distance;
        bestIndex = candidateIndex;
      }
    }
  }
  if (bestIndex === null) return payDate;

  const effectiveYear = Math.floor(bestIndex / 12);
  const effectiveMonth = (bestIndex % 12) + 1;
  const effectiveDay = Math.min(day, lastDayOfMonth(effectiveYear, effectiveMonth));
  return isoDate(effectiveYear, effectiveMonth, effectiveDay);
}

/**
 * Wendet den je Unternehmen hinterlegten Ausschuettungsplan auf eine Liste von
 * Analytics-Zahlungen an: `payDate` wird auf das effektive Datum gesetzt,
 * `actualPayDate` bleibt das echte Zahlungsdatum. Unternehmen ohne Plan bleiben
 * unveraendert. Reine Funktion (liefert eine neue Liste).
 */
export function withEffectiveDates(
  payments: readonly AnalyticsPayment[],
  payoutBySecurity: ReadonlyMap<string, readonly number[]>,
): AnalyticsPayment[] {
  return payments.map((payment) => {
    const months = payoutBySecurity.get(payment.securityId);
    if (!months || months.length === 0) return payment;
    const effective = effectivePayDate(payment.actualPayDate, months);
    if (effective === payment.payDate) return payment;
    return { ...payment, payDate: effective };
  });
}

/** Entfernt Duplikate und ungueltige Werte, sortiert aufsteigend. */
export function normalizePayoutMonths(
  payoutMonths: readonly number[] | null | undefined,
): number[] {
  if (!payoutMonths) return [];
  const valid = new Set<number>();
  for (const month of payoutMonths) {
    if (Number.isInteger(month) && month >= 1 && month <= 12) valid.add(month);
  }
  return [...valid].sort((a, b) => a - b);
}
