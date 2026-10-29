import { isoDate, lastDayOfMonth, monthOf, yearOf } from "./dates";
import type { AnalyticsPayment } from "./types";

/**
 * Bis zu welchem Tag eines Monats eine Zahlung als Nachzuegler des Vormonats
 * gelten kann (CALCULATION_RULES.md §10, seit 2.55.0). Im Abgleich mit der
 * Excel-Historie 2020–2026 traf diese Grenze die von Hand gefuehrten
 * Monatssummen am besten; spaetere Zahlungen gehoeren zu ihrem eigenen Monat.
 */
const LATE_PAYMENT_MAX_DAY = 7;

/** Wie viele Zahlungen ein Asset in einem Monat hatte (Monat 1..12). */
export type PaymentsInMonth = (year: number, month: number) => number;

const NO_COUNTS: PaymentsInMonth = () => 0;

/**
 * Effektives Zahlungsdatum fuer Auswertungen (CALCULATION_RULES.md §10):
 * die **Nachzuegler-Regel**.
 *
 * Eine Zahlung in den ersten {@link LATE_PAYMENT_MAX_DAY} Tagen eines Monats
 * zaehlt zum Vormonat, wenn dieser laut Ausschuettungsplan faellig war — auch
 * ueber den Jahreswechsel (Zahlung am 2. April bei Plan Maerz -> Maerz,
 * 3. Januar bei Plan Dezember -> Dezember des Vorjahres). Ist der
 * Zahlungsmonat selbst geplant (z. B. Monatszahler), gilt das nur, wenn im
 * Vormonat keine Zahlung des Assets kam und in diesem Monat mehrere: Dann ist
 * die fruehe Zahlung erkennbar die verspaetete des Vormonats.
 *
 * Alles andere bleibt am echten Zahltag: Zahlungen nach dem 7., ohne Plan,
 * oder wenn der Vormonat nicht geplant ist. Es wird nie nach vorne gezogen
 * und nie weiter als einen Monat verschoben, damit ein heute gepflegter Plan
 * fruehere Jahre mit anderem Rhythmus nicht umsortiert.
 *
 * Der Tag einer verschobenen Zahlung ist der Monatsletzte des Vormonats: Das
 * Geld kam erst nach Monatsende, also steht sie als letzte Buchung ihres
 * Monats. Reine Funktion, keine Gleitkomma-Geldarithmetik.
 */
export function effectivePayDate(
  payDate: string,
  payoutMonths: readonly number[] | null | undefined,
  paymentsInMonth: PaymentsInMonth = NO_COUNTS,
): string {
  const months = normalizePayoutMonths(payoutMonths);
  if (months.length === 0) return payDate;
  if (Number.parseInt(payDate.slice(8, 10), 10) > LATE_PAYMENT_MAX_DAY) return payDate;

  const year = yearOf(payDate);
  const month = monthOf(payDate);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  if (!months.includes(prevMonth)) return payDate;

  const late =
    !months.includes(month) ||
    (paymentsInMonth(prevYear, prevMonth) === 0 && paymentsInMonth(year, month) >= 2);
  return late
    ? isoDate(prevYear, prevMonth, lastDayOfMonth(prevYear, prevMonth))
    : payDate;
}

/**
 * Baut die Zuordnung fuer eine ganze Historie: zaehlt einmal die Zahlungen je
 * Asset und Monat (fuer Monatszahler) und liefert je Zahlung ihr effektives
 * Datum. Gemeinsame Grundlage von {@link withEffectiveDates} und der
 * Eingangsliste, damit beide dieselben Monate zeigen.
 */
export function effectiveDateResolver(
  payments: readonly { securityId: string; payDate: string }[],
  payoutBySecurity: ReadonlyMap<string, readonly number[]>,
): (securityId: string, payDate: string) => string {
  const counts = new Map<string, number>();
  for (const payment of payments) {
    if (!payoutBySecurity.has(payment.securityId)) continue;
    const key = `${payment.securityId}|${payment.payDate.slice(0, 7)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (securityId, payDate) => {
    const months = payoutBySecurity.get(securityId);
    if (!months) return payDate;
    return effectivePayDate(
      payDate,
      months,
      (year, month) =>
        counts.get(`${securityId}|${String(year)}-${String(month).padStart(2, "0")}`) ??
        0,
    );
  };
}

/**
 * Wendet die Nachzuegler-Regel auf eine Liste von Analytics-Zahlungen an:
 * `payDate` wird auf das effektive Datum gesetzt, `actualPayDate` bleibt das
 * echte Zahlungsdatum. Reine Funktion (liefert eine neue Liste).
 */
export function withEffectiveDates(
  payments: readonly AnalyticsPayment[],
  payoutBySecurity: ReadonlyMap<string, readonly number[]>,
): AnalyticsPayment[] {
  const resolve = effectiveDateResolver(
    payments.map((payment) => ({
      securityId: payment.securityId,
      payDate: payment.actualPayDate,
    })),
    payoutBySecurity,
  );
  return payments.map((payment) => {
    const effective = resolve(payment.securityId, payment.actualPayDate);
    if (effective === payment.payDate) return payment;
    return { ...payment, payDate: effective };
  });
}

/**
 * Ausschuettungsplan je Unternehmen als Nachschlagetabelle fuer
 * {@link withEffectiveDates} und {@link effectiveDateResolver}. Unternehmen
 * ohne gueltigen Plan fehlen darin — fuer sie gilt das echte Zahlungsdatum.
 */
export function payoutMonthsBySecurity(
  securities: readonly { id: string; payout_months: readonly number[] | null }[],
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const security of securities) {
    const months = normalizePayoutMonths(security.payout_months);
    if (months.length > 0) map.set(security.id, months);
  }
  return map;
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
