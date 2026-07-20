import { isoDate, lastDayOfMonth, monthOf, yearOf } from "./dates";
import type { AnalyticsPayment } from "./types";

/**
 * Effektives Zahlungsdatum fuer Auswertungen (CALCULATION_RULES.md §10).
 *
 * Ist fuer ein Unternehmen ein Ausschuettungsplan (`payoutMonths`, Werte 1..12)
 * hinterlegt, wird eine Zahlung dem **letzten faelligen geplanten Monat am oder
 * vor** dem Zahlungsmonat zugeordnet — auch ueber den Jahreswechsel hinweg. So
 * zaehlt eine spaeter als geplant eingetroffene Dividende zu dem Monat, fuer den
 * sie faellig war (z. B. Zahlung am 2. April bei Plan Maerz/Juni/September/
 * Dezember -> Maerz; Anfang-Januar-Zahlung bei Dezember-Plan -> Dezember des
 * Vorjahres). Faellt der Zahlungsmonat selbst auf einen geplanten Monat, bleibt
 * dieser. Ohne Plan bleibt das echte Zahlungsdatum unveraendert.
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

  // Groesster geplanter Monatsindex, der den Zahlungsmonat nicht ueberschreitet
  // (der letzte faellige Monat am/vor der Zahlung). Es genuegt, die geplanten
  // Monate des aktuellen und des Vorjahres zu pruefen.
  let bestIndex = Number.NEGATIVE_INFINITY;
  for (const planned of months) {
    for (const yearOffset of [-1, 0]) {
      const candidateIndex = (year + yearOffset) * 12 + (planned - 1);
      if (candidateIndex <= actualIndex && candidateIndex > bestIndex) {
        bestIndex = candidateIndex;
      }
    }
  }
  if (!Number.isFinite(bestIndex)) return payDate;

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
