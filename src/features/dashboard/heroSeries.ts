import { EUR, Money } from "@/lib/money";
import {
  lastDayOfMonth,
  monthNameDe,
  monthlyBuckets,
  selectedYearComparison,
  yearlyBuckets,
  type AnalyticsPayment,
  type RefDate,
  type YearSelection,
} from "@/lib/statistics";
import { paymentsListHref } from "./format";

const ZERO = Money.zero(EUR);

/** Sicht des Diagramms im Kopf eines Einzeljahres. */
export type HeroChartKind = "cumulative" | "monthly";

/**
 * Ein ansteuerbarer Punkt des Diagramms: genau das, was der Kopf zeigt, wenn
 * der Punkt gewählt ist (Beschriftung, Betrag, Vergleich, Drill-down).
 */
export interface HeroPoint {
  /** Lage auf der Zeitachse in Slots (0 = Anfang, `slots` = Ende). */
  x: number;
  label: string;
  value: Money;
  /** Vergleichswert; `null`, wenn es keinen gibt (erstes Jahr). */
  prior: Money | null;
  priorLabel: string;
  href: string;
}

export interface MonthBar {
  month: number;
  /** `null` für Monate des laufenden Jahres, die noch nicht begonnen haben. */
  current: Money | null;
  prior: Money;
  count: number;
}

export type HeroSeries =
  | {
      kind: "cumulative";
      year: number;
      /** Laufende Summe des Jahres: Jahresbeginn, Monatsenden, ggf. heute. */
      line: { x: number; value: Money }[];
      /** Laufende Summe des Vorjahres an den 13 Monatsgrenzen. */
      priorLine: Money[];
      months: MonthBar[];
      points: HeroPoint[];
    }
  | { kind: "monthly"; year: number; months: MonthBar[]; points: HeroPoint[] }
  | {
      kind: "years";
      bars: { year: number; value: Money; count: number; partial: boolean }[];
      points: HeroPoint[];
    };

function monthBars(
  payments: readonly AnalyticsPayment[],
  year: number,
  today: RefDate,
): MonthBar[] {
  const current = monthlyBuckets(payments, year);
  const prior = monthlyBuckets(payments, year - 1);
  return current.map((bucket, index) => {
    // „Noch nicht begonnen" gilt nur für Monate ohne Zahlungen: Durch den
    // Ausschüttungsplan (§10) kann eine früh eingetroffene Zahlung bereits im
    // kommenden Monat stehen — dieses Geld darf nicht als Lücke verschwinden.
    const notStarted =
      (year > today.year || (year === today.year && bucket.month > today.month)) &&
      bucket.count === 0;
    return {
      month: bucket.month,
      current: notStarted ? null : bucket.net,
      prior: prior[index]?.net ?? ZERO,
      count: bucket.count,
    };
  });
}

/** „bis Ende März 2026" bzw. „bis 14. Oktober 2026". */
function untilLabel(year: number, month: number, day?: number): string {
  return day === undefined
    ? `bis Ende ${monthNameDe(month)} ${String(year)}`
    : `bis ${String(day)}. ${monthNameDe(month)} ${String(year)}`;
}

/**
 * Daten des Diagramms im Kopf der Übersicht (UX_AND_DESIGN_SYSTEM.md
 * „Dashboard"). Rein und ohne Darstellung: Was gezeichnet wird und was der
 * Kopf beim Wischen zeigt, kommt aus derselben Rechnung.
 *
 * - **Kumuliert:** laufende Jahressumme gegen die des Vorjahres. Im laufenden
 *   Jahr endet die Linie heute; ihr letzter Punkt ist genau die Zahl im Kopf
 *   und wird mit dem Vorjahr bis zum gleichen Tag verglichen
 *   ({@link selectedYearComparison}).
 * - **Monatlich:** Monatssummen beider Jahre; Monate, die noch nicht begonnen
 *   haben, bleiben leer statt 0 €.
 * - **Alle Jahre:** ein Punkt je Jahr; das laufende Jahr wird mit dem
 *   Vorjahr bis heute verglichen, nicht mit dem ganzen Vorjahr.
 */
export function buildHeroSeries(
  payments: readonly AnalyticsPayment[],
  selection: YearSelection,
  today: RefDate,
  kind: HeroChartKind,
): HeroSeries {
  if (selection === "all") {
    const buckets = yearlyBuckets(payments);
    const byYear = new Map(buckets.map((b) => [b.year, b.net]));
    const bars = buckets.map((b) => ({
      ...b,
      value: b.net,
      partial: b.year === today.year,
    }));
    const points = bars.map((bar, index): HeroPoint => {
      const year = String(bar.year);
      const prevYear = String(bar.year - 1);
      if (bar.partial) {
        const { prior } = selectedYearComparison(payments, bar.year, today);
        return {
          x: index + 0.5,
          label: `${year} bis heute`,
          value: bar.value,
          prior,
          priorLabel: `${prevYear} bis heute`,
          href: paymentsListHref({ year: bar.year }),
        };
      }
      return {
        x: index + 0.5,
        label: year,
        value: bar.value,
        // Ein Jahr ohne Zahlungen hat keinen Eimer, war aber trotzdem 0 €.
        prior: index === 0 ? null : (byYear.get(bar.year - 1) ?? ZERO),
        priorLabel: prevYear,
        href: paymentsListHref({ year: bar.year }),
      };
    });
    return {
      kind: "years",
      bars: bars.map(({ year, value, count, partial }) => ({
        year,
        value,
        count,
        partial,
      })),
      points,
    };
  }

  const year = selection;
  const months = monthBars(payments, year, today);

  if (kind === "monthly") {
    const points = months.flatMap((bar): HeroPoint[] =>
      bar.current === null
        ? []
        : [
            {
              x: bar.month - 0.5,
              label: `${monthNameDe(bar.month)} ${String(year)}`,
              value: bar.current,
              prior: bar.prior,
              priorLabel: `${monthNameDe(bar.month)} ${String(year - 1)}`,
              href: paymentsListHref({ year, month: bar.month }),
            },
          ],
    );
    return { kind: "monthly", year, months, points };
  }

  const priorLine = [ZERO];
  for (const bar of months)
    priorLine.push(priorLine[priorLine.length - 1].add(bar.prior));

  const isCurrent = year === today.year;
  const completed = year < today.year ? 12 : isCurrent ? today.month - 1 : 0;
  const line = [{ x: 0, value: ZERO }];
  const points: HeroPoint[] = [];
  let running = ZERO;
  for (let month = 1; month <= completed; month += 1) {
    running = running.add(months[month - 1].current ?? ZERO);
    line.push({ x: month, value: running });
    points.push({
      x: month,
      label: untilLabel(year, month),
      value: running,
      prior: priorLine[month],
      priorLabel: untilLabel(year - 1, month),
      href: paymentsListHref({ year }),
    });
  }
  if (isCurrent) {
    const { current, prior } = selectedYearComparison(payments, year, today);
    const x = today.month - 1 + today.day / lastDayOfMonth(year, today.month);
    line.push({ x, value: current });
    points.push({
      x,
      label: untilLabel(year, today.month, today.day),
      value: current,
      prior,
      priorLabel: untilLabel(year - 1, today.month, today.day),
      href: paymentsListHref({ year }),
    });
  }
  return { kind: "cumulative", year, line, priorLine, months, points };
}
