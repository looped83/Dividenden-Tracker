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
 * gleichzeitig: eine Zeile je Kalenderjahr (neueste zuerst), eine Spalte je
 * Kalendermonat. Das beantwortet die Frage, die keine der beiden
 * Einzelansichten beantwortet: „Wie steht dieser Monat gegenueber demselben
 * Monat der Vorjahre?"
 *
 * **Jahre als Zeilen, Monate als Spalten**, nicht umgekehrt: Monate sind zwoelf
 * und bleiben zwoelf, Jahre kommen jedes Jahr eines dazu. Waeren die Jahre die
 * Spalten, wuechse die Tabelle mit jedem Jahreswechsel in die Breite — in die
 * einzige Richtung, in der ein Bildschirm nicht nachgibt.
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
 * sicher.
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

/** Eine Zeile der Matrix: ein Kalenderjahr mit seinen zwoelf Monaten. */
export interface BreakdownYearRow {
  year: number;
  /** Genau zwoelf Zellen, Januar bis Dezember. */
  cells: BreakdownCell[];
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

/** Eine Spaltensumme der Matrix: ein Kalendermonat ueber alle Jahre. */
export interface BreakdownMonthTotal {
  /** Kalendermonat 1..12. */
  month: number;
  net: Money;
  count: number;
}

/** Summenecke der Matrix. */
export interface BreakdownTotals {
  net: Money;
  count: number;
}

/** Jahre × Monate in einer Tabelle (§11.12). */
export interface BreakdownMatrix {
  /** Eine Zeile je Kalenderjahr mit Zahlungen, **absteigend** (neueste zuerst). */
  years: BreakdownYearRow[];
  /** Zwoelf Spaltensummen, Januar bis Dezember. */
  months: BreakdownMonthTotal[];
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
  // `availableYears` liefert bereits absteigend (§3) — genau die Reihenfolge
  // der Zeilen: Das laufende Jahr steht oben, ohne Bildlauf nach unten.
  const years = availableYears(payments);
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

  const rows: BreakdownYearRow[] = years.map((year) => {
    const cellsOfYear: BreakdownCell[] = [];
    let cumulative = ZERO;
    let activeMonths = 0;

    for (let month = 1; month <= 12; month += 1) {
      const bucket = bucketOf(year, month);
      const future = bucket.count === 0 && isAfterRef(year, month, ref);
      cumulative = cumulative.add(bucket.net);
      if (bucket.count > 0) activeMonths += 1;

      cellsOfYear.push({
        year,
        month,
        net: bucket.net,
        count: bucket.count,
        cumulative,
        change: future ? { kind: "no-comparison" } : monthChange(year, month, bucket.net),
        future,
        partial: year === ref.year && month === ref.month,
      });
    }

    const bucket = perYear.get(String(year)) ?? EMPTY_BUCKET;
    return {
      year,
      cells: cellsOfYear,
      net: bucket.net,
      count: bucket.count,
      activeMonths,
      change: yearChange(year),
      running: year === ref.year,
    };
  });

  const months: BreakdownMonthTotal[] = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    let net = ZERO;
    let count = 0;
    for (const year of years) {
      const bucket = bucketOf(year, month);
      net = net.add(bucket.net);
      count += bucket.count;
    }
    return { month, net, count };
  });

  const total = aggregate(payments);

  return {
    years: rows,
    months,
    totals: { net: total.net, count: total.count },
    cutoff: isoFromRef(ref),
  };
}
