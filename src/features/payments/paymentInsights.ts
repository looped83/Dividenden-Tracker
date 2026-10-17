import { Money, formatPercent, sumMoney, type DecimalInstance } from "@/lib/money";
import { monthOf, yearOf, type AnalyticsPayment } from "@/lib/statistics";
import {
  compareToPreviousYear,
  type YearOverYearComparison,
} from "@/features/payments/yearOverYear";

/** Wie viele Dividenden der Verlauf der Detailseite zeigt. */
const HISTORY_SIZE = 12;

/** Vergleich mit einem Bezugsbetrag; `percent` fehlt, wenn der Bezug null ist. */
export interface Delta {
  reference: Money;
  difference: Money;
  percent: DecimalInstance | null;
}

export interface PaymentInsights {
  /** Die unmittelbar vorangehende Dividende desselben Assets. */
  previous: (Delta & { date: string; id: string }) | null;
  /** Gleicher Ausschuettungsmonat im Vorjahr — dieselbe Regel wie die Liste. */
  yearAgo: YearOverYearComparison | null;
  /** Durchschnitt je Dividende in den zwoelf Monaten davor. */
  trailingAverage: (Delta & { count: number }) | null;
  /** 1 = hoechste Dividende des Assets; Gleichstand teilt sich den Rang. */
  rank: number;
  /** Fortlaufende Nummer der Dividende (1 = erste). */
  ordinal: number;
  count: number;
  /** Bis zu {@link HISTORY_SIZE} Dividenden um diese herum, chronologisch. */
  history: AnalyticsPayment[];
  year: { year: number; net: Money; count: number };
  total: Money;
  firstDate: string;
  /**
   * Monat ("YYYY-MM-01") der naechsten planmaessigen Dividende — nur fuer die
   * juengste Dividende und nur mit hinterlegtem Ausschuettungsplan.
   */
  nextExpected: string | null;
}

/** Betrag der Veraenderung in Prozent, ohne Vorzeichen — die Richtung traegt das Dreieck. */
export function percentChange(difference: Money, reference: Money): string {
  if (!reference.isPositive()) return "—";
  return formatPercent(
    difference.toDecimal().div(reference.toDecimal()).times(100).abs(),
  );
}

function chronological(a: AnalyticsPayment, b: AnalyticsPayment): number {
  return a.payDate === b.payDate
    ? a.createdAt.localeCompare(b.createdAt)
    : a.payDate.localeCompare(b.payDate);
}

function delta(current: Money, reference: Money): Delta {
  const difference = current.subtract(reference);
  const percent = reference.isPositive()
    ? difference.toDecimal().div(reference.toDecimal()).times(100)
    : null;
  return { reference, difference, percent };
}

/** Erster Tag des Monats `months` Monate nach (oder vor) `iso`. */
function shiftMonth(iso: string, months: number): string {
  const index = yearOf(iso) * 12 + monthOf(iso) - 1 + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year)}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Ordnet eine Dividende in die Historie ihres Assets ein: Vergleich mit der
 * vorherigen, dem Vorjahr und dem Schnitt der letzten zwoelf Monate, Rang,
 * Jahres- und Gesamtsumme.
 *
 * `own` sind die **aktiven** Dividenden des Assets mit effektivem Datum
 * (`useEffectivePayments`), dieselbe Grundlage wie Statistik und Assetseite.
 * Eine stornierte Dividende steht nicht darin und erhaelt `null`: Sie zaehlt
 * nirgends mit, also auch nicht in ihrem eigenen Vergleich.
 */
export function derivePaymentInsights(
  paymentId: string,
  own: readonly AnalyticsPayment[],
  payoutMonths: readonly number[],
): PaymentInsights | null {
  const current = own.find((payment) => payment.id === paymentId);
  if (!current) return null;
  const currency = current.netAmount.currency;
  const sorted = [...own].sort(chronological);
  const index = sorted.indexOf(current);
  const amount = current.netAmount;

  const before = index > 0 ? sorted[index - 1] : undefined;
  const previous = before
    ? { ...delta(amount, before.netAmount), date: before.payDate, id: before.id }
    : null;

  const windowStart = shiftMonth(current.payDate, -12);
  const trailing = sorted
    .slice(0, index)
    .filter((payment) => payment.payDate >= windowStart);
  const trailingAverage =
    trailing.length > 0
      ? {
          ...delta(
            amount,
            Money.fromDecimal(
              sumMoney(
                trailing.map((payment) => payment.netAmount),
                currency,
              )
                .toDecimal()
                .div(trailing.length),
              currency,
            ),
          ),
          count: trailing.length,
        }
      : null;

  const yearAgo =
    compareToPreviousYear(
      sorted.map((payment) => ({
        id: payment.id,
        securityId: payment.securityId,
        effectiveDate: payment.payDate,
        amount: payment.netAmount,
        cancelled: false,
      })),
    ).get(current.id) ?? null;

  // Das Fenster endet moeglichst bei dieser Dividende; bei einer fruehen
  // fuellen spaetere es auf, damit es nicht halb leer bleibt.
  const start = Math.max(
    0,
    Math.min(index - HISTORY_SIZE + 1, sorted.length - HISTORY_SIZE),
  );
  const history = sorted.slice(start, start + HISTORY_SIZE);

  const year = yearOf(current.payDate);
  const inYear = sorted.filter((payment) => yearOf(payment.payDate) === year);

  const months = new Set(payoutMonths);
  let nextExpected: string | null = null;
  if (index === sorted.length - 1 && months.size > 0) {
    for (let step = 1; step <= 12 && nextExpected === null; step += 1) {
      const candidate = shiftMonth(current.payDate, step);
      if (months.has(monthOf(candidate))) nextExpected = candidate;
    }
  }

  return {
    previous,
    yearAgo,
    trailingAverage,
    rank: 1 + sorted.filter((payment) => payment.netAmount.compareTo(amount) > 0).length,
    ordinal: index + 1,
    count: sorted.length,
    history,
    year: {
      year,
      net: sumMoney(
        inYear.map((payment) => payment.netAmount),
        currency,
      ),
      count: inYear.length,
    },
    total: sumMoney(
      sorted.map((payment) => payment.netAmount),
      currency,
    ),
    firstDate: sorted[0]?.payDate ?? current.payDate,
    nextExpected,
  };
}
