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
  GroupBucket,
  HistoricalSummary,
  MonthBucket,
  MonthValue,
  YearBucket,
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
