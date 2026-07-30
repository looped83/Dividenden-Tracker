import { isoDate, lastDayOfMonth, monthOf, yearOf } from "./dates";
import type { AnalyticsPayment } from "./types";

/**
 * Wie weit eine frueher als geplant eingetroffene Zahlung nach vorne in ihren
 * geplanten Monat gezogen werden darf (in Monaten). Eine Zahlung im Monat
 * unmittelbar vor einem geplanten Monat gilt als vorgezogene Zahlung dieses
 * Monats; weiter entfernte kuenftige Plan-Monate bleiben ausser Betracht.
 */
const MAX_EARLY_MONTHS = 1;

/**
 * Effektives Zahlungsdatum fuer Auswertungen (CALCULATION_RULES.md §10).
 *
 * Ist fuer ein Unternehmen ein Ausschuettungsplan (`payoutMonths`, Werte 1..12)
 * hinterlegt, zaehlt eine Zahlung zu dem geplanten Monat, fuer den sie bestimmt
 * ist — auch ueber den Jahreswechsel hinweg:
 *
 * - Ist der Zahlungsmonat selbst geplant, bleibt er (Normalfall).
 * - Sonst gilt die Zahlung als **verspaetet** und zaehlt zum letzten faelligen
 *   geplanten Monat am/vor dem Zahlungsmonat (z. B. Zahlung 2. April bei Plan
 *   Maerz/Juni/September/Dezember -> Maerz; Anfang-Januar-Zahlung bei
 *   Dezember-Plan -> Dezember des Vorjahres).
 * - Liegt dieser faellige Monat aber mehr als {@link MAX_EARLY_MONTHS} Monate
 *   zurueck und ist der **unmittelbar folgende** Monat geplant, gilt die Zahlung
 *   als **vorgezogen** und zaehlt zu diesem geplanten Monat (z. B. Zahlung im
 *   Juni bei Plan Januar/April/Juli/Oktober -> Juli). Bei gleichem Abstand
 *   gewinnt der fruehere (faellige) Monat, weil Zahlungen haeufiger spaet als
 *   frueh eintreffen (Plan Maerz/Mai, Zahlung im April -> Maerz).
 *
 * Ohne Plan bleibt das echte Zahlungsdatum unveraendert.
 *
 * Der Tag wird aus dem echten Datum uebernommen und auf die Monatslaenge
 * begrenzt; bei einer vorgezogenen Zahlung ist es der 1. des geplanten Monats,
 * damit bereits erhaltenes Geld in Zeitraeumen „bis heute" (Monat/Jahr bis
 * heute) nicht erst am Zahltag sichtbar wird. Der Tag dient nur der internen
 * Datumsdarstellung, nicht der Zuordnung. Reine Funktion, keine
 * Gleitkomma-Geldarithmetik.
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

  // Letzter faelliger geplanter Monat am/vor der Zahlung und naechster geplanter
  // Monat danach. Es genuegt, die geplanten Monate der Jahre J−1, J und J+1 zu
  // pruefen (der Jahreswechsel ist damit in beide Richtungen abgedeckt).
  let dueIndex = Number.NEGATIVE_INFINITY;
  let nextIndex = Number.POSITIVE_INFINITY;
  for (const planned of months) {
    for (const yearOffset of [-1, 0, 1]) {
      const candidateIndex = (year + yearOffset) * 12 + (planned - 1);
      if (candidateIndex <= actualIndex) {
        if (candidateIndex > dueIndex) dueIndex = candidateIndex;
      } else if (candidateIndex < nextIndex) {
        nextIndex = candidateIndex;
      }
    }
  }

  // Vorgezogene Zahlung: der naechste geplante Monat steht unmittelbar bevor,
  // waehrend der letzte faellige Monat weiter zurueckliegt.
  const isEarly =
    Number.isFinite(nextIndex) &&
    nextIndex - actualIndex <= MAX_EARLY_MONTHS &&
    (!Number.isFinite(dueIndex) || actualIndex - dueIndex > MAX_EARLY_MONTHS);

  if (isEarly) {
    return isoDate(Math.floor(nextIndex / 12), (nextIndex % 12) + 1, 1);
  }
  if (!Number.isFinite(dueIndex)) return payDate;

  const effectiveYear = Math.floor(dueIndex / 12);
  const effectiveMonth = (dueIndex % 12) + 1;
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
