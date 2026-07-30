import { EUR, Money } from "@/lib/money";
import {
  isoDate,
  isoFromRef,
  lastDayOfMonth,
  monthOf,
  yearOf,
  type DateRange,
  type RefDate,
} from "./dates";
import {
  aggregate,
  availableYears,
  comparePeriods,
  selectedYearComparison,
} from "./analytics";
import type { AnalyticsPayment, ComparisonResult } from "./types";

/**
 * Breakdown: alle Jahre und Monate in **einer** Matrix (CALCULATION_RULES.md §11.12).
 *
 * Die uebrigen Statistikbereiche zeigen jeweils eine Achse — Jahre untereinander
 * oder Monate ueber alle Jahre zusammengefasst. Hier stehen beide Achsen
 * gleichzeitig: eine Zeile je Kalendermonat, eine Spalte je Kalenderjahr. Das
 * beantwortet die Frage, die keine der beiden Einzelansichten beantwortet:
 * „Wie steht dieser Monat gegenueber demselben Monat der Vorjahre?"
 *
 * Zwei Regeln tragen die Rechnung:
 *
 * 1. **Ein angefangener Zeitraum wird nie gegen einen vollen gestellt.** Der
 *    laufende Monat und das laufende Jahr werden fuer den Vergleich auf beiden
 *    Seiten am Stichtag gekappt (dieselbe Regel wie §11.10) — sonst entstuende
 *    ein Ruecklauf, den es nicht gibt.
 * 2. **Noch nicht erreichte Monate sind keine Nullmonate.** Sie tragen kein
 *    Ergebnis (`future`), damit die Oberflaeche einen Gedankenstrich statt
 *    „0,00 €" zeigen kann; ein 0-€-Dezember im Juli waere schlicht falsch.
 *
 * Keine Prognose, keine Hochrechnung (PRODUCT_SPEC.md Grundsatz 8): Es werden
 * ausschliesslich vorhandene Zahlungen summiert. Alle Betraege sind decimal-
 * sicher; gerundet wird ausschliesslich am Ende einer Division (R-4).
 */

const ZERO = Money.zero(EUR);

/** Eine Zelle der Matrix: ein Kalendermonat eines Kalenderjahres. */
export interface BreakdownCell {
  year: number;
  /** Kalendermonat 1..12. */
  month: number;
  net: Money;
  count: number;
  /** Laufende Jahressumme bis einschliesslich dieses Monats. */
  cumulative: Money;
  /**
   * Veraenderung gegenueber demselben Monat des Vorjahres (§6.4). Fehlt das
   * Vorjahr in der Datenbasis oder liegt der Monat in der Zukunft, gilt „kein
   * Vergleichswert" — nie eine erfundene Prozentzahl.
   */
  change: ComparisonResult;
  /** Noch nicht erreichter Monat ohne Zahlungen: kein Ergebnis, keine Null. */
  future: boolean;
  /** Der laufende Monat — die Summe waechst noch. */
  partial: boolean;
}

/** Eine Zeile der Matrix: ein Kalendermonat ueber alle Jahre. */
export interface BreakdownMonthRow {
  month: number;
  /** Eine Zelle je Jahr, in derselben Reihenfolge wie {@link BreakdownMatrix.years}. */
  cells: BreakdownCell[];
  /** Summe ueber alle Jahre, inklusive des laufenden. */
  net: Money;
  count: number;
  /**
   * Durchschnitt dieses Monats ueber die **abgeschlossenen** Jahre
   * (`Σ net ÷ Anzahl abgeschlossener Jahre`); null, wenn es keine gibt. Das
   * laufende Jahr bleibt aussen vor: Es haette fuer noch nicht erreichte Monate
   * eine 0 beigesteuert und den Durchschnitt kuenstlich gedrueckt. Weil alle
   * Zeilen denselben Divisor benutzen, ergeben die Zeilendurchschnitte in Summe
   * genau den Gesamtdurchschnitt.
   */
  average: Money | null;
}

/** Eine Spalte der Matrix: ein Kalenderjahr. */
export interface BreakdownYearColumn {
  year: number;
  net: Money;
  count: number;
  /** Monate mit mindestens einer Zahlung. */
  activeMonths: number;
  /**
   * Veraenderung der Jahressumme gegenueber dem Vorjahr. Im laufenden Jahr
   * vergleichen beide Seiten denselben Ausschnitt (1.1. bis Stichtag, §6.2).
   */
  change: ComparisonResult;
  /** Das laufende Kalenderjahr — unvollstaendig. */
  running: boolean;
}

/** Summenzeile der Matrix. */
export interface BreakdownTotals {
  net: Money;
  count: number;
  /** Durchschnittliches abgeschlossenes Jahr; null ohne abgeschlossenes Jahr. */
  average: Money | null;
}

/** Jahre × Monate in einer Tabelle (§11.12). */
export interface BreakdownMatrix {
  /** Vorhandene Kalenderjahre, aufsteigend (aelteste zuerst). */
  years: BreakdownYearColumn[];
  /** Genau zwoelf Zeilen, Januar bis Dezember. */
  months: BreakdownMonthRow[];
  /** Anzahl abgeschlossener Jahre — Divisor der Ø-Werte. */
  completedYears: number;
  totals: BreakdownTotals;
  /** Letzter beruecksichtigter Tag des laufenden Jahres (ISO), fuer die Fussnote. */
  cutoff: string;
}

interface Bucket {
  net: Money;
  count: number;
}

const EMPTY_BUCKET: Bucket = { net: ZERO, count: 0 };

function cellKey(year: number, month: number): string {
  return `${String(year)}-${String(month)}`;
}

function add(map: Map<string, Bucket>, key: string, payment: AnalyticsPayment): void {
  const bucket = map.get(key) ?? { net: ZERO, count: 0 };
  map.set(key, { net: bucket.net.add(payment.netAmount), count: bucket.count + 1 });
}

/** Summe innerhalb eines inklusiven Datumsbereichs. */
function netInRange(payments: readonly AnalyticsPayment[], range: DateRange): Money {
  return aggregate(
    payments.filter((p) => p.payDate >= range.start && p.payDate <= range.end),
  ).net;
}

/** Liegt (Jahr, Monat) hinter dem Stichtagsmonat? */
function isAfterRef(year: number, month: number, ref: RefDate): boolean {
  return year > ref.year || (year === ref.year && month > ref.month);
}

/**
 * Baut die Matrix aus den (bereits gefilterten) Zahlungen.
 *
 * @param ref Stichtag „heute" als Kalendertripel — macht die Kappung des
 *            laufenden Zeitraums deterministisch testbar.
 */
export function breakdownMatrix(
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
): BreakdownMatrix {
  const years = availableYears(payments).sort((a, b) => a - b);
  const yearSet = new Set(years);

  const cells = new Map<string, Bucket>();
  const perYear = new Map<string, Bucket>();
  for (const payment of payments) {
    const year = yearOf(payment.payDate);
    add(cells, cellKey(year, monthOf(payment.payDate)), payment);
    add(perYear, String(year), payment);
  }

  const bucketOf = (year: number, month: number): Bucket =>
    cells.get(cellKey(year, month)) ?? EMPTY_BUCKET;

  /**
   * Vergleich eines Monats mit demselben Monat des Vorjahres. Der laufende
   * Monat wird auf beiden Seiten am Stichtag gekappt; hat der Vorjahresmonat
   * weniger Tage (29.02.), zaehlt dessen letzter Tag (§11.10).
   */
  const monthChange = (year: number, month: number, net: Money): ComparisonResult => {
    if (!yearSet.has(year - 1)) return { kind: "no-comparison" };
    if (year !== ref.year || month !== ref.month) {
      return comparePeriods(net, bucketOf(year - 1, month).net);
    }
    const current = netInRange(payments, {
      start: isoDate(year, month, 1),
      end: isoFromRef(ref),
    });
    const priorDay = Math.min(ref.day, lastDayOfMonth(year - 1, month));
    const prior = netInRange(payments, {
      start: isoDate(year - 1, month, 1),
      end: isoDate(year - 1, month, priorDay),
    });
    return comparePeriods(current, prior);
  };

  const completedYears = years.filter((year) => year < ref.year);
  const divisor = completedYears.length;

  // Laufende Jahressumme, waehrend die Zeilen Januar → Dezember entstehen.
  const running = new Map<number, Money>(years.map((year) => [year, ZERO]));

  const months: BreakdownMonthRow[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const row: BreakdownCell[] = [];
    let rowNet = ZERO;
    let rowCount = 0;
    let completedNet = ZERO;

    for (const year of years) {
      const bucket = bucketOf(year, month);
      const future = bucket.count === 0 && isAfterRef(year, month, ref);
      const cumulative = (running.get(year) ?? ZERO).add(bucket.net);
      running.set(year, cumulative);

      row.push({
        year,
        month,
        net: bucket.net,
        count: bucket.count,
        cumulative,
        change: future ? { kind: "no-comparison" } : monthChange(year, month, bucket.net),
        future,
        partial: year === ref.year && month === ref.month,
      });

      rowNet = rowNet.add(bucket.net);
      rowCount += bucket.count;
      if (year < ref.year) completedNet = completedNet.add(bucket.net);
    }

    months.push({
      month,
      cells: row,
      net: rowNet,
      count: rowCount,
      average:
        divisor === 0
          ? null
          : Money.fromDecimal(completedNet.toDecimal().div(divisor), EUR),
    });
  }

  /**
   * Vergleich der Jahressumme mit dem Vorjahr. Im laufenden Jahr zaehlt auf
   * beiden Seiten 1.1. bis Stichtag (§6.2) — ein angefangenes Jahr gegen ein
   * volles waere eine systematische Untertreibung.
   */
  const yearChange = (year: number): ComparisonResult => {
    if (!yearSet.has(year - 1)) return { kind: "no-comparison" };
    const { current, prior } = selectedYearComparison(payments, year, ref);
    return comparePeriods(current, prior);
  };

  const columns: BreakdownYearColumn[] = years.map((year) => {
    const bucket = perYear.get(String(year)) ?? EMPTY_BUCKET;
    let activeMonths = 0;
    for (let month = 1; month <= 12; month += 1) {
      if (bucketOf(year, month).count > 0) activeMonths += 1;
    }
    return {
      year,
      net: bucket.net,
      count: bucket.count,
      activeMonths,
      change: yearChange(year),
      running: year === ref.year,
    };
  });

  const total = aggregate(payments);
  const completedNet = columns
    .filter((column) => column.year < ref.year)
    .reduce<Money>((sum, column) => sum.add(column.net), ZERO);

  return {
    years: columns,
    months,
    completedYears: divisor,
    totals: {
      net: total.net,
      count: total.count,
      average:
        divisor === 0
          ? null
          : Money.fromDecimal(completedNet.toDecimal().div(divisor), EUR),
    },
    cutoff: isoFromRef(ref),
  };
}
