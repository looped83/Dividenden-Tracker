import { EUR, Money, sumMoney, type DecimalInstance } from "@/lib/money";
import {
  activeMonthCount,
  aggregate,
  averagePerMonth,
  bestMonthInYear,
  comparePeriods,
  distinctSecurities,
  groupBySecurity,
  monthlyBuckets,
  rankGroups,
  shareOfTotal,
  yearlyBuckets,
} from "./analytics";
import { yearOf, type RefDate } from "./dates";
import type {
  AnalyticsPayment,
  ComparisonResult,
  MonthBucket,
  MonthValue,
} from "./types";

/**
 * Jahresrueckblick (Statistik › Rueckblick): die Kennzahlen eines einzelnen
 * Kalenderjahres in der Form, die die Story erzaehlt. Reine Funktion ueber
 * denselben {@link AnalyticsPayment}-Datensaetzen wie alle uebrigen
 * Kennzahlen (effektives Datum, §10) — sie setzt sich aus den Bausteinen der
 * Analytics-Schicht zusammen und rechnet nichts doppelt.
 *
 * Der Rueckblick gilt immer dem **ganzen** Bestand: Ein Unternehmens- oder
 * Depotfilter der Statistik wirkt hier nicht, ein „Jahr eines Unternehmens"
 * waere eine andere Geschichte.
 */

/** Branche und Land eines Assets aus den Stammdaten; beide optional. */
export interface ReviewFacets {
  sector: string | null;
  country: string | null;
}

export interface ReviewRankedSecurity {
  securityId: string;
  net: Money;
  count: number;
  /** Anteil an der Jahressumme in Prozentpunkten; null bei Jahressumme ≤ 0. */
  share: DecimalInstance | null;
}

export interface ReviewRaise {
  securityId: string;
  net: Money;
  priorNet: Money;
  /** Zuwachs gegenueber dem Vorjahr (immer > 0). */
  absolute: Money;
}

export interface ReviewShare {
  key: string;
  net: Money;
  share: DecimalInstance | null;
}

export interface AnnualReview {
  year: number;
  /** Laufendes Jahr: Die Zahlen gelten „bis heute". */
  isPartial: boolean;
  net: Money;
  gross: Money;
  /** Brutto minus netto: Quellensteuer, Abgeltungsteuer, Soli, Kirchensteuer, Gebuehren. */
  deductions: Money;
  /** Anteil der Abzuege am Brutto in Prozentpunkten; null bei Brutto ≤ 0. */
  deductionShare: DecimalInstance | null;
  count: number;
  distinctSecurities: number;
  /** Monate des Jahres mit mindestens einer Zahlung. */
  activeMonths: number;
  /** Nettosumme ÷ Tage des Jahres (laufendes Jahr: Tage bis heute). */
  perDay: Money;
  /** Ø Monat wie in Statistik › Verlauf (§7, laufendes Jahr: begonnene Monate). */
  perMonth: Money;
  change: ComparisonResult;
  priorYearNet: Money | null;
  /** Zwoelf Monatseimer des Jahres. */
  months: MonthBucket[];
  bestMonth: MonthValue | null;
  /** Hoechstens fuenf Zahler, nach Nettosumme absteigend (§9). */
  topPayers: ReviewRankedSecurity[];
  /** Assets mit ihrer allerersten Zahlung in diesem Jahr, nach Nettosumme. */
  newcomers: ReviewRankedSecurity[];
  /** Groesster absoluter Zuwachs eines Assets gegenueber dem Vorjahr. */
  biggestRaise: ReviewRaise | null;
  /** Groesste Einzelzahlung des Jahres. */
  largestPayment: { securityId: string; net: Money; payDate: string } | null;
  /** Branchen nach Nettosumme; ohne Branchenangabe nicht enthalten. */
  sectors: ReviewShare[];
  /** Anzahl verschiedener Laender (aus den Stammdaten). */
  countries: number;
  /** Platz des Jahres unter allen Jahren nach Nettosumme (1 = bestes). */
  rank: number;
  yearCount: number;
  /** Summe aller Jahre bis einschliesslich dieses Jahres. */
  cumulativeNet: Money;
  firstYear: number;
}

const ZERO = Money.zero(EUR);
const TOP_PAYERS = 5;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Tag des Jahres (1-basiert) fuer ein Referenzdatum. */
function dayOfYear(ref: RefDate): number {
  const start = Date.UTC(ref.year, 0, 1);
  const current = Date.UTC(ref.year, ref.month - 1, ref.day);
  return Math.round((current - start) / 86_400_000) + 1;
}

/**
 * Jahre, fuer die es einen Rueckblick gibt, neueste zuerst: alle
 * abgeschlossenen Jahre mit Zahlungen, das laufende erst ab Dezember — vorher
 * waere es ein Rueckblick auf ein halbes Jahr.
 */
export function reviewYears(
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
): number[] {
  const years = new Set<number>();
  for (const payment of payments) {
    const year = yearOf(payment.payDate);
    if (year < ref.year || (year === ref.year && ref.month === 12)) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

function ranked(
  payments: readonly AnalyticsPayment[],
  total: Money,
  labelOf: (securityId: string) => string,
): ReviewRankedSecurity[] {
  return rankGroups(groupBySecurity(payments), labelOf).map((bucket) => ({
    securityId: bucket.key,
    net: bucket.net,
    count: bucket.count,
    share: shareOfTotal(bucket.net, total),
  }));
}

/**
 * Kennzahlen des Rueckblicks fuer `year`. `payments` sind **alle** aktiven
 * Eingaenge — Vorjahr, Erstzahlungen und kumulierte Summe brauchen die
 * Historie. Gibt null zurueck, wenn das Jahr keine Zahlungen hat.
 */
export function annualReview(
  payments: readonly AnalyticsPayment[],
  year: number,
  ref: RefDate,
  facets: ReadonlyMap<string, ReviewFacets>,
  labelOf: (securityId: string) => string = (id) => id,
): AnnualReview | null {
  const rows = payments.filter((p) => yearOf(p.payDate) === year);
  if (rows.length === 0) return null;

  const { net, count } = aggregate(rows);
  const gross = sumMoney(
    rows.map((p) => p.grossAmount),
    EUR,
  );
  const deductions = gross.subtract(net);

  const years = yearlyBuckets(payments);
  const prior = years.find((bucket) => bucket.year === year - 1) ?? null;
  const priorYearNet = prior?.net ?? null;
  const rank = years.filter((bucket) => bucket.net.compareTo(net) > 0).length + 1;
  const cumulativeNet = sumMoney(
    years.filter((bucket) => bucket.year <= year).map((bucket) => bucket.net),
    EUR,
  );

  const isPartial = year === ref.year;
  const days = isPartial ? dayOfYear(ref) : isLeapYear(year) ? 366 : 365;

  // Erste Zahlung je Asset ueber die gesamte Historie.
  const firstYearOf = new Map<string, number>();
  for (const payment of payments) {
    const paymentYear = yearOf(payment.payDate);
    const known = firstYearOf.get(payment.securityId);
    if (known === undefined || paymentYear < known) {
      firstYearOf.set(payment.securityId, paymentYear);
    }
  }

  const topAll = ranked(rows, net, labelOf);
  const newcomers = topAll.filter((entry) => firstYearOf.get(entry.securityId) === year);

  // Zuwachs nur fuer Assets, die in beiden Jahren gezahlt haben — ein
  // Neuzugang ist kein „gesteigert", er steht unter den Neuen.
  const priorBySecurity = new Map(
    groupBySecurity(payments.filter((p) => yearOf(p.payDate) === year - 1)).map(
      (bucket) => [bucket.key, bucket.net],
    ),
  );
  let biggestRaise: ReviewRaise | null = null;
  for (const entry of topAll) {
    const priorNet = priorBySecurity.get(entry.securityId);
    if (!priorNet?.isPositive()) continue;
    const absolute = entry.net.subtract(priorNet);
    if (!absolute.isPositive()) continue;
    if (biggestRaise === null || absolute.compareTo(biggestRaise.absolute) > 0) {
      biggestRaise = { securityId: entry.securityId, net: entry.net, priorNet, absolute };
    }
  }

  let largestPayment: AnnualReview["largestPayment"] = null;
  for (const payment of rows) {
    if (largestPayment === null || payment.netAmount.compareTo(largestPayment.net) > 0) {
      largestPayment = {
        securityId: payment.securityId,
        net: payment.netAmount,
        payDate: payment.actualPayDate,
      };
    }
  }

  const bySector = new Map<string, Money>();
  const countries = new Set<string>();
  for (const payment of rows) {
    const facet = facets.get(payment.securityId);
    if (facet?.country) countries.add(facet.country);
    const sector = facet?.sector?.trim();
    if (!sector) continue;
    bySector.set(sector, (bySector.get(sector) ?? ZERO).add(payment.netAmount));
  }
  const sectors = [...bySector.entries()]
    .map(([key, sectorNet]) => ({
      key,
      net: sectorNet,
      share: shareOfTotal(sectorNet, net),
    }))
    .sort((a, b) => b.net.compareTo(a.net) || a.key.localeCompare(b.key, "de"));

  return {
    year,
    isPartial,
    net,
    gross,
    deductions,
    deductionShare: gross.isPositive()
      ? deductions.toDecimal().div(gross.toDecimal()).times(100)
      : null,
    count,
    distinctSecurities: distinctSecurities(rows),
    activeMonths: activeMonthCount(rows),
    perDay: Money.fromDecimal(net.toDecimal().div(days), EUR),
    perMonth: averagePerMonth(payments, year, ref),
    change: comparePeriods(net, priorYearNet),
    priorYearNet,
    months: monthlyBuckets(rows, year),
    bestMonth: bestMonthInYear(rows, year),
    topPayers: topAll.slice(0, TOP_PAYERS),
    newcomers,
    biggestRaise,
    largestPayment,
    sectors,
    countries: countries.size,
    rank,
    yearCount: years.length,
    cumulativeNet,
    firstYear: years[0]?.year ?? year,
  };
}

/** Pfad des Rueckblicks eines Jahres. */
export function reviewHref(year: number): string {
  return `/statistiken/rueckblick/${String(year)}`;
}
