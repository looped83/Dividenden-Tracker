import { Money, formatPercent, sumMoney, type DecimalInstance } from "@/lib/money";
import { monthOf, yearOf, type AnalyticsPayment } from "@/lib/statistics";
import {
  compareToPreviousYear,
  type YearOverYearComparison,
} from "@/features/payments/yearOverYear";

/** Wie viele Monate mit Dividenden der Verlauf der Detailseite zeigt. */
const HISTORY_SIZE = 12;

/** Wie viele Dividenden die Liste unter der Einordnung zeigt — wie die Assetseite. */
const NEARBY_SIZE = 5;

/**
 * Ein Balken des Verlaufs: alle Dividenden eines Monats zusammen. Zwei
 * Zahlungen im selben Monat (verschobener Zahltag, Sonderdividende) standen
 * zuvor als zwei Balken mit derselben Achsenbeschriftung nebeneinander.
 */
export interface HistoryMonth {
  /** Erster Tag des Monats, "YYYY-MM-01". */
  month: string;
  /** Die Dividenden des Monats, chronologisch. */
  payments: AnalyticsPayment[];
  net: Money;
  /** Bis einschliesslich dieses Monats insgesamt erhalten (kumulierte Sicht). */
  total: Money;
}

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
  /**
   * Monatlicher Zahler: Dann sagt der Vergleich mit der vorherigen Dividende
   * etwas aus. Bei Quartals- oder Jahreszahlern taugt nur das Vorjahr — die
   * vorherige Zahlung kann eine Sonder- oder Zwischendividende sein, und
   * Erhoehungen kommen meist einmal im Jahr.
   */
  monthly: boolean;
  /** Durchschnitt je Dividende in den zwoelf Monaten davor. */
  trailingAverage: (Delta & { count: number }) | null;
  /** 1 = hoechste Dividende des Assets; Gleichstand teilt sich den Rang. */
  rank: number;
  /** Fortlaufende Nummer der Dividende (1 = erste). */
  ordinal: number;
  count: number;
  /** Bis zu {@link HISTORY_SIZE} Monate um diese Dividende herum, chronologisch. */
  history: HistoryMonth[];
  /**
   * Bis zu {@link NEARBY_SIZE} Dividenden um diese herum, juengste zuerst —
   * bei einer aelteren Dividende sagen ihre Nachbarn mehr als die juengsten.
   */
  nearby: AnalyticsPayment[];
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

/** Veraenderung gegenueber `reference`, aus der Differenz. */
export function deltaOf(difference: Money, reference: Money): Delta {
  const percent = reference.isPositive()
    ? difference.toDecimal().div(reference.toDecimal()).times(100)
    : null;
  return { reference, difference, percent };
}

function delta(current: Money, reference: Money): Delta {
  return deltaOf(current.subtract(reference), reference);
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

  // Ein Balken je Monat. Das Fenster endet moeglichst beim Monat dieser
  // Dividende; bei einer fruehen fuellen spaetere es auf, damit es nicht halb
  // leer bleibt.
  const byMonth: { month: string; payments: AnalyticsPayment[] }[] = [];
  for (const payment of sorted) {
    const month = `${payment.payDate.slice(0, 7)}-01`;
    const last = byMonth.at(-1);
    if (last?.month === month) last.payments.push(payment);
    else byMonth.push({ month, payments: [payment] });
  }
  const currentMonth = byMonth.findIndex((bucket) => bucket.payments.includes(current));
  const start = Math.max(
    0,
    Math.min(currentMonth - HISTORY_SIZE + 1, byMonth.length - HISTORY_SIZE),
  );
  let running = sumMoney(
    byMonth.slice(0, start).flatMap((bucket) => bucket.payments.map((p) => p.netAmount)),
    currency,
  );
  const history = byMonth.slice(start, start + HISTORY_SIZE).map((bucket) => {
    const net = sumMoney(
      bucket.payments.map((payment) => payment.netAmount),
      currency,
    );
    running = running.add(net);
    return { ...bucket, net, total: running };
  });

  const nearbyStart = Math.max(
    0,
    Math.min(index - Math.floor(NEARBY_SIZE / 2), sorted.length - NEARBY_SIZE),
  );
  const nearby = sorted.slice(nearbyStart, nearbyStart + NEARBY_SIZE).reverse();

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

  // Massgeblich ist der Ausschuettungsplan des Assets; ohne Plan entscheidet
  // die Historie (mindestens zehn Zahlungen in den zwoelf Monaten davor).
  const monthly = months.size > 0 ? months.size === 12 : trailing.length >= 10;

  return {
    previous,
    yearAgo,
    monthly,
    trailingAverage,
    rank: 1 + sorted.filter((payment) => payment.netAmount.compareTo(amount) > 0).length,
    ordinal: index + 1,
    count: sorted.length,
    history,
    nearby,
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
