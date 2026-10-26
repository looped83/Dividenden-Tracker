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
import { dayOfYear, daysInYear, yearOf, type RefDate } from "./dates";
import type {
  AnalyticsPayment,
  ComparisonResult,
  MonthBucket,
  MonthValue,
  YearBucket,
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
  /** Alle Jahre bis einschliesslich dieses, aufsteigend. */
  years: YearBucket[];
  /** Vielfaches des ersten Jahres (2 = doppelt so viel); null ohne Vorjahre. */
  growthFactor: DecimalInstance | null;
  /** Durchschnitt der Jahre vor diesem; null ohne Vorjahre. */
  priorAverage: Money | null;
}

const ZERO = Money.zero(EUR);
const TOP_PAYERS = 5;
/** Ab diesem Dezembertag gibt es den Rueckblick auf das laufende Jahr. */
const REVIEW_OPENS_DAY = 15;
/** Bis zu diesem Januartag steht der Rueckblick des Vorjahres auf der Startseite. */
const HOME_TEASER_UNTIL_DAY = 10;

function currentYearOpen(ref: RefDate): boolean {
  return ref.month === 12 && ref.day >= REVIEW_OPENS_DAY;
}

/**
 * Jahre, fuer die es einen Rueckblick gibt, neueste zuerst: alle
 * abgeschlossenen Jahre mit Zahlungen, das laufende erst ab 15. Dezember —
 * vorher waere es ein Rueckblick auf ein halbes Jahr.
 */
export function reviewYears(
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
): number[] {
  const years = new Set<number>();
  const openNow = currentYearOpen(ref);
  for (const payment of payments) {
    const year = yearOf(payment.payDate);
    if (year < ref.year || (year === ref.year && openNow)) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * Das Jahr, dessen Rueckblick die Startseite gerade anbietet: vom 15. Dezember
 * bis 10. Januar das zu Ende gehende Jahr, sonst keines. Ohne Zahlungen in
 * diesem Jahr gibt es nichts zu erzaehlen.
 */
export function homeReviewYear(
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
): number | null {
  const year = currentYearOpen(ref)
    ? ref.year
    : ref.month === 1 && ref.day <= HOME_TEASER_UNTIL_DAY
      ? ref.year - 1
      : null;
  if (year === null) return null;
  return payments.some((p) => yearOf(p.payDate) === year) ? year : null;
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
 *
 * Der Rueckblick steht am Ende **seines** Jahres: Spaetere Jahre gehen in
 * keine Kennzahl ein. „Dein bisher bestes Jahr" meint die Jahre bis
 * einschliesslich `year` — ein spaeteres, besseres Jahr aendert den Rueckblick
 * auf 2023 nicht.
 */
export function annualReview(
  payments: readonly AnalyticsPayment[],
  year: number,
  ref: RefDate,
  facets: ReadonlyMap<string, ReviewFacets>,
  labelOf: (securityId: string) => string = (id) => id,
): AnnualReview | null {
  const history = payments.filter((p) => yearOf(p.payDate) <= year);
  const rows = payments.filter((p) => yearOf(p.payDate) === year);
  if (rows.length === 0) return null;

  const { net, count } = aggregate(rows);

  const years = yearlyBuckets(history);
  const prior = years.find((bucket) => bucket.year === year - 1) ?? null;
  const priorYearNet = prior?.net ?? null;
  const rank = years.filter((bucket) => bucket.net.compareTo(net) > 0).length + 1;
  const cumulativeNet = sumMoney(
    years.map((bucket) => bucket.net),
    EUR,
  );

  const isPartial = year === ref.year;
  const days = isPartial ? dayOfYear(ref) : daysInYear(year);

  // Erste Zahlung je Asset bis einschliesslich dieses Jahres.
  const firstYearOf = new Map<string, number>();
  for (const payment of history) {
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
    groupBySecurity(history.filter((p) => yearOf(p.payDate) === year - 1)).map(
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

  const priorYears = years.filter((bucket) => bucket.year < year);
  const first = years.at(0);
  const growthFactor =
    priorYears.length > 0 && first?.net.isPositive()
      ? net.toDecimal().div(first.net.toDecimal())
      : null;
  const priorAverage =
    priorYears.length > 0
      ? Money.fromDecimal(
          sumMoney(
            priorYears.map((bucket) => bucket.net),
            EUR,
          )
            .toDecimal()
            .div(priorYears.length),
          EUR,
        )
      : null;

  return {
    year,
    isPartial,
    net,
    count,
    distinctSecurities: distinctSecurities(rows),
    activeMonths: activeMonthCount(rows),
    perDay: Money.fromDecimal(net.toDecimal().div(days), EUR),
    perMonth: averagePerMonth(rows, year, ref),
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
    years,
    growthFactor,
    priorAverage,
  };
}

/** Pfad des Rueckblicks eines Jahres. */
export function reviewHref(year: number): string {
  return `/statistiken/rueckblick/${String(year)}`;
}
