import { EUR, Money, sumMoney, type DecimalInstance } from "@/lib/money";
import {
  isInRange,
  isoDate,
  monthOf,
  priorYearSameDay,
  ytdRange,
  monthToDateRange,
  priorYearMonthToDateRange,
  yearOf,
  type DateRange,
  type RefDate,
} from "./dates";
import type {
  Aggregate,
  AnalyticsPayment,
  ComparisonResult,
  DepotStatistics,
  GroupBucket,
  HeatmapRow,
  HistoricalSummary,
  MonthAcrossYearsStatistics,
  MonthBucket,
  MonthValue,
  OverviewStatistics,
  SecuritySortKey,
  SecurityStatistics,
  StatisticsFilter,
  YearBucket,
  YearStatistics,
} from "./types";

/**
 * Analytics-Schicht (Phase 5A). Reine, decimal-sichere Funktionen ueber bereits
 * geparsten {@link AnalyticsPayment}-Datensaetzen. Sie sind die einzige Quelle
 * aller Dashboard-Kennzahlen (CALCULATION_RULES.md §6) und in Phase 5B fuer den
 * Statistikbereich wiederverwendbar. Es gibt hier keine React-Abhaengigkeit und
 * keine Float-Arithmetik.
 *
 * Datenbasis: Der Aufrufer liefert ausschliesslich aktive Eingaenge
 * (`archived_at is null`). Stornierte/archivierte Zahlungen sind damit
 * standardmaessig ausgeschlossen; archivierte Unternehmen und Depots bleiben
 * ueber ihre (weiterhin aktiven) historischen Zahlungen enthalten.
 */

const ZERO = Money.zero(EUR);

// --- Basis-Aggregate ---------------------------------------------------------

export function aggregate(payments: readonly AnalyticsPayment[]): Aggregate {
  const net = sumMoney(
    payments.map((p) => p.netAmount),
    EUR,
  );
  return { net, count: payments.length };
}

export function aggregateInRange(
  payments: readonly AnalyticsPayment[],
  range: DateRange,
): Aggregate {
  return aggregate(payments.filter((p) => isInRange(p.payDate, range)));
}

export function aggregateInYear(
  payments: readonly AnalyticsPayment[],
  year: number,
): Aggregate {
  return aggregate(payments.filter((p) => yearOf(p.payDate) === year));
}

// --- Gruppierungen -----------------------------------------------------------

/**
 * Zwoelf Monatseimer eines Kalenderjahres. Monate ohne Zahlungen erscheinen als
 * 0 € (count 0) — ob ein Monat als „noch nicht begonnen" gilt, entscheidet die
 * Zeitreihen-Ableitung (§7), nicht diese Aggregation.
 */
export function monthlyBuckets(
  payments: readonly AnalyticsPayment[],
  year: number,
): MonthBucket[] {
  const buckets: MonthBucket[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    net: ZERO,
    count: 0,
  }));
  for (const payment of payments) {
    if (yearOf(payment.payDate) !== year) continue;
    // pay_date ist per DB-Constraint ein gueltiges Datum → Monat 1..12.
    const bucket = buckets[monthOf(payment.payDate) - 1];
    bucket.net = bucket.net.add(payment.netAmount);
    bucket.count += 1;
  }
  return buckets;
}

/** Ein Eimer je vorhandenem Kalenderjahr, chronologisch aufsteigend (§7 „Alle Jahre"). */
export function yearlyBuckets(payments: readonly AnalyticsPayment[]): YearBucket[] {
  const byYear = new Map<number, { net: Money; count: number }>();
  for (const payment of payments) {
    const year = yearOf(payment.payDate);
    const entry = byYear.get(year) ?? { net: ZERO, count: 0 };
    entry.net = entry.net.add(payment.netAmount);
    entry.count += 1;
    byYear.set(year, entry);
  }
  return [...byYear.entries()]
    .map(([year, entry]) => ({ year, net: entry.net, count: entry.count }))
    .sort((a, b) => a.year - b.year);
}

function groupByKey(
  payments: readonly AnalyticsPayment[],
  keyOf: (payment: AnalyticsPayment) => string,
): GroupBucket[] {
  const byKey = new Map<string, { net: Money; count: number }>();
  for (const payment of payments) {
    const key = keyOf(payment);
    const entry = byKey.get(key) ?? { net: ZERO, count: 0 };
    entry.net = entry.net.add(payment.netAmount);
    entry.count += 1;
    byKey.set(key, entry);
  }
  // Deterministische Grundordnung nach Schluessel; die fachliche Rangfolge
  // (Betrag/Anzahl/Name) stellt `rankGroups` her.
  return [...byKey.entries()]
    .map(([key, entry]) => ({ key, net: entry.net, count: entry.count }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function groupBySecurity(payments: readonly AnalyticsPayment[]): GroupBucket[] {
  return groupByKey(payments, (p) => p.securityId);
}

export function groupByDepot(payments: readonly AnalyticsPayment[]): GroupBucket[] {
  return groupByKey(payments, (p) => p.depotId);
}

/**
 * Rangfolge nach §9-Sortierung: 1) Nettosumme absteigend, 2) Anzahl Zahlungen
 * absteigend, 3) Anzeigename alphabetisch (de). `labelOf` liefert den Namen zum
 * Schluessel; fehlt er, wird der Schluessel selbst verglichen (stabil).
 */
export function rankGroups(
  buckets: readonly GroupBucket[],
  labelOf: (key: string) => string = (key) => key,
): GroupBucket[] {
  return [...buckets].sort((a, b) => {
    const byNet = b.net.compareTo(a.net);
    if (byNet !== 0) return byNet;
    if (b.count !== a.count) return b.count - a.count;
    return labelOf(a.key).localeCompare(labelOf(b.key), "de");
  });
}

/** Anteil eines Betrags an der Gesamtsumme in Prozentpunkten; null wenn Gesamt ≤ 0. */
export function shareOfTotal(part: Money, total: Money): DecimalInstance | null {
  if (!total.isPositive()) return null;
  return part.toDecimal().div(total.toDecimal()).times(100);
}

// --- Extremwerte -------------------------------------------------------------

function bestMonthAmong(payments: readonly AnalyticsPayment[]): MonthValue | null {
  const byMonth = new Map<string, MonthValue>();
  for (const payment of payments) {
    const year = yearOf(payment.payDate);
    const month = monthOf(payment.payDate);
    const mapKey = `${String(year)}-${String(month)}`;
    const entry = byMonth.get(mapKey) ?? { year, month, net: ZERO };
    entry.net = entry.net.add(payment.netAmount);
    byMonth.set(mapKey, entry);
  }
  let best: MonthValue | null = null;
  for (const candidate of byMonth.values()) {
    if (best === null) {
      best = candidate;
      continue;
    }
    const byNet = candidate.net.compareTo(best.net);
    if (byNet > 0) {
      best = candidate;
    } else if (byNet === 0) {
      // Gleichstand: aktuellerer Monat zuerst (§5.5).
      if (
        candidate.year > best.year ||
        (candidate.year === best.year && candidate.month > best.month)
      ) {
        best = candidate;
      }
    }
  }
  return best;
}

/** Bester Kalendermonat der gesamten Historie (§5.5 „Alle Jahre"). */
export function bestMonthAllTime(
  payments: readonly AnalyticsPayment[],
): MonthValue | null {
  return bestMonthAmong(payments);
}

/** Bester Monat innerhalb eines einzelnen Jahres (§5.5 Einzeljahr). */
export function bestMonthInYear(
  payments: readonly AnalyticsPayment[],
  year: number,
): MonthValue | null {
  return bestMonthAmong(payments.filter((p) => yearOf(p.payDate) === year));
}

// --- Historie ----------------------------------------------------------------

export function firstPayDate(payments: readonly AnalyticsPayment[]): string | null {
  let min: string | null = null;
  for (const payment of payments) {
    if (min === null || payment.payDate < min) min = payment.payDate;
  }
  return min;
}

export function lastPayDate(payments: readonly AnalyticsPayment[]): string | null {
  let max: string | null = null;
  for (const payment of payments) {
    if (max === null || payment.payDate > max) max = payment.payDate;
  }
  return max;
}

export function distinctSecurities(payments: readonly AnalyticsPayment[]): number {
  return new Set(payments.map((p) => p.securityId)).size;
}

export function distinctDepots(payments: readonly AnalyticsPayment[]): number {
  return new Set(payments.map((p) => p.depotId)).size;
}

/** Historische Gesamtuebersicht (§5.3/§12), immer ueber alle aktiven Eingaenge. */
export function historicalSummary(
  payments: readonly AnalyticsPayment[],
): HistoricalSummary {
  const { net, count } = aggregate(payments);
  return {
    net,
    count,
    distinctSecurities: distinctSecurities(payments),
    distinctDepots: distinctDepots(payments),
    firstPayDate: firstPayDate(payments),
    lastPayDate: lastPayDate(payments),
  };
}

/**
 * Letzte Dividendeneingaenge (§11), unabhaengig von der Jahresauswahl.
 * Sortierung: Zahlungsdatum absteigend, dann Erstellungszeit absteigend, dann
 * technische ID absteigend (stabil und deterministisch).
 */
export function recentPayments(
  payments: readonly AnalyticsPayment[],
  limit = 10,
): AnalyticsPayment[] {
  return [...payments]
    .sort((a, b) => {
      if (a.payDate !== b.payDate) return a.payDate < b.payDate ? 1 : -1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    })
    .slice(0, limit);
}

// --- Durchschnitt / Vergleich -------------------------------------------------

/**
 * Durchschnitt pro Monat (§5.4). Laufendes Jahr: Jahressumme ÷ begonnene Monate
 * (inkl. aktuellem Monat). Abgeschlossenes Jahr: Jahressumme ÷ 12. Die Division
 * laeuft ueber Decimal; das Ergebnis wird erst hier auf 2 Stellen gerundet (R-4).
 */
export function averagePerMonth(
  payments: readonly AnalyticsPayment[],
  year: number,
  ref: RefDate,
): Money {
  const { net } = aggregateInYear(payments, year);
  const divisor = year === ref.year ? ref.month : 12;
  return Money.fromDecimal(net.toDecimal().div(divisor), EUR);
}

/**
 * Vergleich zweier Zeitraeume (§6.4). `prior === null` bedeutet: es existiert
 * kein Vergleichszeitraum (z. B. Auswahl „Alle Jahre").
 */
export function comparePeriods(current: Money, prior: Money | null): ComparisonResult {
  if (prior === null) return { kind: "no-comparison" };
  const absolute = current.subtract(prior);
  if (prior.isPositive()) {
    const percent = current
      .toDecimal()
      .minus(prior.toDecimal())
      .div(prior.toDecimal())
      .times(100);
    return { kind: "percent", absolute, percent };
  }
  if (prior.isZero()) {
    if (current.isPositive()) return { kind: "new", absolute };
    if (current.isZero()) return { kind: "both-zero" };
  }
  // Negativer Vergleichswert (seltene Korrekturkonstellation): keine sinnvolle
  // Prozentzahl; die Karte zeigt in diesem Fall nur den absoluten Wert.
  return { kind: "no-comparison" };
}

// --- Zeitraum-Selektoren (fasst §5/§6 fuer die Karten zusammen) --------------

export type YearSelection = number | "all";

/** Summe/Anzahl fuer den ausgewaehlten Zeitraum (§5.1). */
export function selectedPeriodAggregate(
  payments: readonly AnalyticsPayment[],
  selection: YearSelection,
): Aggregate {
  if (selection === "all") return aggregate(payments);
  return aggregateInYear(payments, selection);
}

/**
 * Aktueller Wert und Vorjahres-Vergleichswert fuer die Jahresauswahl (§6.1/§6.2).
 * Laufendes Jahr: gleicher YTD-Zeitraum. Abgeschlossenes Jahr: volles Vorjahr.
 * `prior === null` bei „Alle Jahre" (kein Vorjahresvergleich, §5.1).
 */
export function selectedYearComparison(
  payments: readonly AnalyticsPayment[],
  selection: YearSelection,
  ref: RefDate,
): { current: Money; prior: Money | null } {
  if (selection === "all") {
    return { current: aggregate(payments).net, prior: null };
  }
  if (selection === ref.year) {
    const current = aggregateInRange(payments, ytdRange(selection, ref)).net;
    const prior = aggregateInRange(payments, {
      start: isoDate(selection - 1, 1, 1),
      end: priorYearSameDay(ref),
    }).net;
    return { current, prior };
  }
  const current = aggregateInYear(payments, selection).net;
  const prior = aggregateInYear(payments, selection - 1).net;
  return { current, prior };
}

/** Aktueller Monat bis heute (§5.2), unabhaengig von der Jahresauswahl. */
export function currentMonthAggregate(
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
): Aggregate {
  return aggregateInRange(payments, monthToDateRange(ref));
}

/** Aktueller Monat vs. gleicher Monatszeitraum im Vorjahr (§6.3). */
export function currentMonthComparison(
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
): { current: Money; prior: Money } {
  const current = aggregateInRange(payments, monthToDateRange(ref)).net;
  const prior = aggregateInRange(payments, priorYearMonthToDateRange(ref)).net;
  return { current, prior };
}

/** Vorhandene Kalenderjahre der Datenbasis, absteigend (fuer die Jahresauswahl §3). */
export function availableYears(payments: readonly AnalyticsPayment[]): number[] {
  const years = new Set(payments.map((p) => yearOf(p.payDate)));
  return [...years].sort((a, b) => b - a);
}

// =============================================================================
// Phase 5B — Statistikbereich (CALCULATION_RULES.md §11)
//
// Alle folgenden Funktionen sind reine, decimal-sichere Aggregationen ueber
// bereits geparsten {@link AnalyticsPayment}-Datensaetzen mit effektivem Datum
// (§10). Sie bauen konsequent auf den Basis-Aggregaten oben auf und sind die
// einzige Quelle der Statistik-Kennzahlen — es entstehen keine parallelen
// Berechnungen und keine Logik in React-Komponenten.
// =============================================================================

/**
 * Wendet den kombinierbaren Statistikfilter (§11) an. Reine Vorstufe der
 * Aggregation: `null`-Kriterien schraenken nicht ein, gesetzte Kriterien wirken
 * als UND-Verknuepfung. Der Jahresfilter bezieht sich auf das **effektive**
 * Kalenderjahr (§10), konsistent zu allen uebrigen Kennzahlen.
 */
export function filterPayments(
  payments: readonly AnalyticsPayment[],
  filter: StatisticsFilter,
): AnalyticsPayment[] {
  return payments.filter((p) => {
    if (filter.year !== null && yearOf(p.payDate) !== filter.year) return false;
    if (filter.securityId !== null && p.securityId !== filter.securityId) return false;
    if (filter.depotId !== null && p.depotId !== filter.depotId) return false;
    if (filter.source !== null && p.source !== filter.source) return false;
    if (filter.paymentType !== null && p.paymentType !== filter.paymentType) return false;
    return true;
  });
}

/** True, wenn kein Filterkriterium gesetzt ist. */
export function isEmptyFilter(filter: StatisticsFilter): boolean {
  return (
    filter.year === null &&
    filter.securityId === null &&
    filter.depotId === null &&
    filter.source === null &&
    filter.paymentType === null
  );
}

/** Durchschnittliche Einzelzahlung: Nettosumme ÷ Anzahl Zahlungen (0 € ohne Zahlungen). */
export function averagePayment(payments: readonly AnalyticsPayment[]): Money {
  const { net, count } = aggregate(payments);
  if (count === 0) return ZERO;
  return Money.fromDecimal(net.toDecimal().div(count), EUR);
}

/** Groesste einzelne Nettozahlung; null ohne Zahlungen. */
export function largestPayment(payments: readonly AnalyticsPayment[]): Money | null {
  let max: Money | null = null;
  for (const payment of payments) {
    if (max === null || payment.netAmount.compareTo(max) > 0) max = payment.netAmount;
  }
  return max;
}

/** Anzahl der Kalendermonate (Jahr+Monat) mit mindestens einer Zahlung. */
export function activeMonthCount(payments: readonly AnalyticsPayment[]): number {
  const months = new Set<string>();
  for (const payment of payments) {
    months.add(`${String(yearOf(payment.payDate))}-${String(monthOf(payment.payDate))}`);
  }
  return months.size;
}

/**
 * Schwaechster Monat mit Zahlungen (Minimum der Monatssummen). Monate ohne
 * Zahlungen zaehlen nicht als „schwaechster Monat" (kein kuenstlicher 0 €-Monat).
 * Bei Gleichstand gewinnt der aeltere Monat (Spiegelbild zu §5.5 „bester Monat").
 */
function worstMonthAmong(payments: readonly AnalyticsPayment[]): MonthValue | null {
  const byMonth = new Map<string, MonthValue>();
  for (const payment of payments) {
    const year = yearOf(payment.payDate);
    const month = monthOf(payment.payDate);
    const mapKey = `${String(year)}-${String(month)}`;
    const entry = byMonth.get(mapKey) ?? { year, month, net: ZERO };
    entry.net = entry.net.add(payment.netAmount);
    byMonth.set(mapKey, entry);
  }
  let worst: MonthValue | null = null;
  for (const candidate of byMonth.values()) {
    if (worst === null) {
      worst = candidate;
      continue;
    }
    const byNet = candidate.net.compareTo(worst.net);
    if (byNet < 0) {
      worst = candidate;
    } else if (byNet === 0) {
      // Gleichstand: aelterer Monat zuerst.
      if (
        candidate.year < worst.year ||
        (candidate.year === worst.year && candidate.month < worst.month)
      ) {
        worst = candidate;
      }
    }
  }
  return worst;
}

/** Schwaechster Monat mit Zahlungen innerhalb eines einzelnen Jahres (§11.3). */
export function worstMonthInYear(
  payments: readonly AnalyticsPayment[],
  year: number,
): MonthValue | null {
  return worstMonthAmong(payments.filter((p) => yearOf(p.payDate) === year));
}

/** Bestes Kalenderjahr nach Nettosumme; bei Gleichstand das aktuellere (§11.1). */
export function bestYear(payments: readonly AnalyticsPayment[]): YearBucket | null {
  let best: YearBucket | null = null;
  for (const bucket of yearlyBuckets(payments)) {
    if (best === null || bucket.net.compareTo(best.net) >= 0) {
      // yearlyBuckets ist aufsteigend sortiert; „>=" bevorzugt bei Gleichstand
      // damit den spaeteren (aktuelleren) Jahrgang.
      best = bucket;
    }
  }
  return best;
}

/** Zwoelf Kalendermonatseimer ueber **alle** Jahre (Jahr wird ignoriert). */
export function calendarMonthBuckets(
  payments: readonly AnalyticsPayment[],
): MonthBucket[] {
  const buckets: MonthBucket[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    net: ZERO,
    count: 0,
  }));
  for (const payment of payments) {
    const bucket = buckets[monthOf(payment.payDate) - 1];
    bucket.net = bucket.net.add(payment.netAmount);
    bucket.count += 1;
  }
  return buckets;
}

/** Partitioniert Zahlungen nach effektivem Kalenderjahr (einmaliger Durchlauf). */
function partitionByYear(
  payments: readonly AnalyticsPayment[],
): Map<number, AnalyticsPayment[]> {
  const byYear = new Map<number, AnalyticsPayment[]>();
  for (const payment of payments) {
    const year = yearOf(payment.payDate);
    const bucket = byYear.get(year);
    if (bucket) bucket.push(payment);
    else byYear.set(year, [payment]);
  }
  return byYear;
}

/** Partitioniert Zahlungen nach einem Schluessel (Unternehmen/Depot). */
function partitionByKey(
  payments: readonly AnalyticsPayment[],
  keyOf: (payment: AnalyticsPayment) => string,
): Map<string, AnalyticsPayment[]> {
  const byKey = new Map<string, AnalyticsPayment[]>();
  for (const payment of payments) {
    const key = keyOf(payment);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(payment);
    else byKey.set(key, [payment]);
  }
  return byKey;
}

/** Gesamtueberblick der (gefilterten) Historie (§11.1). */
export function overviewStatistics(
  payments: readonly AnalyticsPayment[],
): OverviewStatistics {
  const { net, count } = aggregate(payments);
  return {
    net,
    count,
    distinctSecurities: distinctSecurities(payments),
    distinctDepots: distinctDepots(payments),
    averagePayment: averagePayment(payments),
    averageMonth: averagePerActiveMonth(payments),
    activeMonths: activeMonthCount(payments),
    bestMonth: bestMonthAllTime(payments),
    bestYear: bestYear(payments),
    firstPayDate: firstPayDate(payments),
    lastPayDate: lastPayDate(payments),
  };
}

/** Durchschnitt je aktivem Monat: Nettosumme ÷ Monate mit Zahlungen (§11.1/§11.2). */
export function averagePerActiveMonth(payments: readonly AnalyticsPayment[]): Money {
  const months = activeMonthCount(payments);
  if (months === 0) return ZERO;
  return Money.fromDecimal(aggregate(payments).net.toDecimal().div(months), EUR);
}

/** Jahresstatistik, neueste Jahre zuerst (§11.3). */
export function yearStatistics(payments: readonly AnalyticsPayment[]): YearStatistics[] {
  const byYear = partitionByYear(payments);
  const netByYear = new Map<number, Money>();
  for (const [year, rows] of byYear) netByYear.set(year, aggregate(rows).net);

  const stats: YearStatistics[] = [];
  for (const [year, rows] of byYear) {
    const { net, count } = aggregate(rows);
    const priorYearNet = netByYear.get(year - 1) ?? null;
    stats.push({
      year,
      net,
      count,
      distinctSecurities: distinctSecurities(rows),
      distinctDepots: distinctDepots(rows),
      averagePayment: averagePayment(rows),
      bestMonth: bestMonthInYear(rows, year),
      worstMonth: worstMonthInYear(rows, year),
      change: comparePeriods(net, priorYearNet),
      priorYearNet,
    });
  }
  return stats.sort((a, b) => b.year - a.year);
}

/** Monatsstatistik ueber alle Jahre: ein Eintrag je Kalendermonat 1..12 (§11.4). */
export function monthAcrossYearsStatistics(
  payments: readonly AnalyticsPayment[],
): MonthAcrossYearsStatistics[] {
  const byMonth = new Map<number, AnalyticsPayment[]>();
  for (let month = 1; month <= 12; month += 1) byMonth.set(month, []);
  for (const payment of payments) {
    byMonth.get(monthOf(payment.payDate))?.push(payment);
  }
  return [...byMonth.entries()]
    .map(([month, rows]) => {
      const { net, count } = aggregate(rows);
      return {
        month,
        net,
        count,
        averagePayment: averagePayment(rows),
        perYear: yearlyBuckets(rows),
      };
    })
    .sort((a, b) => a.month - b.month);
}

/** Unternehmensstatistik, unsortiert (Reihenfolge via {@link sortSecurityStatistics}). */
export function securityStatistics(
  payments: readonly AnalyticsPayment[],
): SecurityStatistics[] {
  const byKey = partitionByKey(payments, (p) => p.securityId);
  const stats: SecurityStatistics[] = [];
  for (const [securityId, rows] of byKey) {
    const { net, count } = aggregate(rows);
    stats.push({
      securityId,
      net,
      count,
      firstPayDate: firstPayDate(rows),
      lastPayDate: lastPayDate(rows),
      averagePayment: averagePayment(rows),
      largestPayment: largestPayment(rows),
      perYear: yearlyBuckets(rows),
    });
  }
  return stats;
}

/**
 * Sortiert die Unternehmensstatistik (§11.5). `name`/`lastPayment` mit stabilem
 * alphabetischem Tiebreaker (de); fehlende letzte Zahlungen zuletzt.
 */
export function sortSecurityStatistics(
  stats: readonly SecurityStatistics[],
  sortKey: SecuritySortKey,
  labelOf: (securityId: string) => string,
): SecurityStatistics[] {
  const byName = (a: SecurityStatistics, b: SecurityStatistics) =>
    labelOf(a.securityId).localeCompare(labelOf(b.securityId), "de");
  return [...stats].sort((a, b) => {
    switch (sortKey) {
      case "net": {
        const byNet = b.net.compareTo(a.net);
        if (byNet !== 0) return byNet;
        if (b.count !== a.count) return b.count - a.count;
        return byName(a, b);
      }
      case "count": {
        if (b.count !== a.count) return b.count - a.count;
        const byNet = b.net.compareTo(a.net);
        if (byNet !== 0) return byNet;
        return byName(a, b);
      }
      case "lastPayment": {
        if (a.lastPayDate !== b.lastPayDate) {
          if (a.lastPayDate === null) return 1;
          if (b.lastPayDate === null) return -1;
          return a.lastPayDate < b.lastPayDate ? 1 : -1;
        }
        return byName(a, b);
      }
      case "name":
        return byName(a, b);
    }
  });
}

/** Depotstatistik, unsortiert (Rangfolge via {@link rankGroups} auf net/count). */
export function depotStatistics(
  payments: readonly AnalyticsPayment[],
): DepotStatistics[] {
  const byKey = partitionByKey(payments, (p) => p.depotId);
  const stats: DepotStatistics[] = [];
  for (const [depotId, rows] of byKey) {
    const { net, count } = aggregate(rows);
    stats.push({
      depotId,
      net,
      count,
      distinctSecurities: distinctSecurities(rows),
      perYear: yearlyBuckets(rows),
      perMonth: calendarMonthBuckets(rows),
    });
  }
  return stats.sort((a, b) => {
    const byNet = b.net.compareTo(a.net);
    if (byNet !== 0) return byNet;
    return b.count - a.count;
  });
}

/** Zahlungs-Heatmap Jahr × Monat: eine Zeile je Jahr, neueste zuerst (§11.7). */
export function heatmapByYearMonth(payments: readonly AnalyticsPayment[]): HeatmapRow[] {
  return availableYears(payments).map((year) => ({
    year,
    months: monthlyBuckets(payments, year),
  }));
}
