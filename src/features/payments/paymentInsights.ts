import {
  Money,
  MoneyDecimal,
  formatPercent,
  sumMoney,
  type DecimalInstance,
} from "@/lib/money";
import { monthOf, yearOf, type AnalyticsPayment } from "@/lib/statistics";
import {
  compareToPreviousYear,
  type YearOverYearComparison,
} from "@/features/payments/yearOverYear";

/** Wie viele Monate mit Dividenden der Verlauf der Detailseite zeigt. */
const HISTORY_SIZE = 12;

/** Hoechstens so viele vergangene volle Jahre traegt das Ø-Wachstum — wie bei den Zielen. */
const GROWTH_YEARS = 3;

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
}

/** Ein Balken der Jahresansicht: alle Dividenden des Assets in einem Kalenderjahr. */
export interface HistoryYear {
  year: number;
  net: Money;
  count: number;
  /**
   * Bis einschliesslich dieses Jahres insgesamt erhalten (kumulierte Sicht,
   * seit 2.51.0 je Jahr statt je Monat: so steht die ganze Kurve seit der
   * ersten Dividende im Bild, nicht nur die letzten zwoelf Monate).
   */
  total: Money;
}

/** Mittleres jaehrliches Wachstum (CAGR) der Jahressummen, in Prozent. */
export interface AnnualGrowth {
  percent: DecimalInstance;
  from: number;
  to: number;
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
   * Bis zu {@link HISTORY_SIZE} Kalenderjahre um das Jahr dieser Dividende,
   * chronologisch; Jahre ohne Dividende dazwischen stehen mit 0 darin.
   */
  years: HistoryYear[];
  /** Ø-Wachstum der Jahressummen ueber volle Jahre; `null` ohne zwei solche Jahre. */
  growth: AnnualGrowth | null;
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
 * `own` sind die **aktiven** Dividenden des Assets nach Zahltag
 * (`useAnalyticsPayments`), dieselbe Grundlage wie Statistik und Assetseite.
 * Eine stornierte Dividende steht nicht darin und erhaelt `null`: Sie zaehlt
 * nirgends mit, also auch nicht in ihrem eigenen Vergleich.
 */
export function derivePaymentInsights(
  paymentId: string,
  own: readonly AnalyticsPayment[],
  payoutMonths: readonly number[],
  todayYear: number,
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
        payDate: payment.payDate,
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
  const history = byMonth.slice(start, start + HISTORY_SIZE).map((bucket) => ({
    ...bucket,
    net: sumMoney(
      bucket.payments.map((payment) => payment.netAmount),
      currency,
    ),
  }));

  // Ein Balken je Kalenderjahr, wie in Statistik › Verlauf › Jahre; dasselbe
  // Fenster wie bei den Monaten.
  const firstYear = yearOf(sorted[0].payDate);
  const lastYear = yearOf(sorted[sorted.length - 1].payDate);
  const allYears: HistoryYear[] = [];
  let running = Money.zero(currency);
  for (let y = firstYear; y <= lastYear; y += 1) {
    const inThisYear = sorted.filter((payment) => yearOf(payment.payDate) === y);
    const net = sumMoney(
      inThisYear.map((payment) => payment.netAmount),
      currency,
    );
    running = running.add(net);
    allYears.push({ year: y, net, count: inThisYear.length, total: running });
  }
  const yearStart = Math.max(
    0,
    Math.min(
      yearOf(current.payDate) - firstYear - HISTORY_SIZE + 1,
      allYears.length - HISTORY_SIZE,
    ),
  );
  const years = allYears.slice(yearStart, yearStart + HISTORY_SIZE);

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
    years,
    growth: annualGrowth(allYears, todayYear),
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

/**
 * Ø-Wachstum der Jahressummen ueber die letzten (hoechstens drei) **vollen**
 * Jahre: Das erste Jahr mit Dividende zaehlt nicht, die Position kam meist im
 * Lauf des Jahres dazu; das laufende Jahr ist noch offen. Zukaeufe stecken mit
 * darin — ohne Stueckzahl je Zahlung laesst sich keine Erhoehung je Aktie
 * herausrechnen (§11.11).
 */
function annualGrowth(
  years: readonly HistoryYear[],
  todayYear: number,
): AnnualGrowth | null {
  if (years.length === 0) return null;
  const first = years[0].year;
  const to = Math.min(first + years.length - 1, todayYear - 1);
  const from = Math.max(first + 1, to - GROWTH_YEARS);
  if (to <= from) return null;
  const start = years[from - first].net.toDecimal();
  const end = years[to - first].net.toDecimal();
  if (start.lte(0)) return null;
  const percent = end
    .div(start)
    .pow(new MoneyDecimal(1).div(to - from))
    .minus(1)
    .times(100);
  return { percent, from, to };
}
