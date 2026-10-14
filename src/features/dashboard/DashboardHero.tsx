import * as React from "react";
import { Link } from "react-router";
import { KpiHero, TrendPill, type KpiStat } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { formatMoney, formatPercent } from "@/lib/money";
import { computeGoalProgress, type GoalProgress } from "@/lib/goals";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { useGoals } from "@/features/goals/hooks";
import { GoalProgressBar } from "@/features/goals/GoalProgressBar";
import { accessibleProgressLabel, statusLabel } from "@/features/goals/format";
import {
  averagePerMonth,
  bestMonthAllTime,
  bestMonthInYear,
  comparePeriods,
  currentMonthAggregate,
  currentMonthComparison,
  distinctSecurities,
  monthNameDe,
  selectedPeriodAggregate,
  selectedYearComparison,
  yearOf,
  type AnalyticsPayment,
  type ComparisonResult,
  type RefDate,
  type YearSelection,
} from "@/lib/statistics";
import { describeSelection, paymentsListHref, splitComparison } from "./format";

interface DashboardHeroProps {
  payments: AnalyticsPayment[];
  selection: YearSelection;
  today: RefDate;
}

/** Nur ein echter Prozentvergleich (oder „neu") ergibt eine Marke. */
function hasTrend(result: ComparisonResult): boolean {
  return result.kind === "percent" || result.kind === "new";
}

/**
 * Kopf der Übersicht: die Dividenden des gewählten Zeitraums als Hauptzahl,
 * daneben der Vorjahresvergleich, darunter das Jahresziel und eine Leiste mit
 * aktuellem Monat, Durchschnitt und bestem Monat.
 *
 * Er ersetzt vier gleich große Kacheln und die beiden Zielkarten darunter.
 * Das Jahresziel stand dort getrennt von der Summe, auf die es sich bezieht;
 * jetzt liest sich beides als ein Satz: „1.951,91 € — 46,5 % vom Jahresziel".
 * Das Monatsziel steht im Feld des Monats. Die Zielkarten selbst zeigt die
 * Zielseite.
 *
 * **Gezeigt wird nur, was zum gewählten Zeitraum gehört** (wie zuvor bei den
 * Kacheln und der Zielsektion): Der laufende Monat und sein Ziel erscheinen
 * nur im laufenden Jahr und bei „Alle Jahre", ein Jahresziel nur zu einem
 * Jahr. Der Durchschnitt pro Monat entfällt bei „Alle Jahre".
 */
export function DashboardHero({ payments, selection, today }: DashboardHeroProps) {
  const goals = useGoals().data;

  const data = React.useMemo(() => {
    const isAll = selection === "all";
    const { current, prior } = selectedYearComparison(payments, selection, today);
    const monthCompare = currentMonthComparison(payments, today);
    return {
      isAll,
      isCurrentYear: selection === today.year,
      net: selectedPeriodAggregate(payments, selection).net,
      period: isAll ? payments : payments.filter((p) => yearOf(p.payDate) === selection),
      yearResult: comparePeriods(current, prior),
      monthNet: currentMonthAggregate(payments, today).net,
      monthResult: comparePeriods(monthCompare.current, monthCompare.prior),
      best:
        selection === "all"
          ? bestMonthAllTime(payments)
          : bestMonthInYear(payments, selection),
      average: selection === "all" ? null : averagePerMonth(payments, selection, today),
    };
  }, [payments, selection, today]);

  const { annual, monthly } = React.useMemo(() => {
    const find = (type: "annual" | "monthly", year: number, month: number | null) =>
      goals?.find(
        (g) =>
          g.goalType === type && g.year === year && (month === null || g.month === month),
      );
    const annualGoal = selection === "all" ? undefined : find("annual", selection, null);
    const monthlyGoal =
      selection === today.year ? find("monthly", today.year, today.month) : undefined;
    return {
      annual: annualGoal ? computeGoalProgress(annualGoal, payments, today) : null,
      monthly: monthlyGoal ? computeGoalProgress(monthlyGoal, payments, today) : null,
    };
  }, [goals, selection, payments, today]);

  const label = describeSelection(selection);
  const reference = data.isCurrentYear ? "ggü. Vorjahreszeitraum" : "ggü. Vorjahr";
  const year = splitComparison(data.yearResult, "");
  const month = splitComparison(data.monthResult, "ggü. Vj.");

  const stats: KpiStat[] = [];
  if (data.isAll || data.isCurrentYear) {
    stats.push({
      label: monthNameDe(today.month),
      value: <AmountText amount={data.monthNet} />,
      // Ein Monatsziel sagt mehr als der Vorjahresmonat: Es ist die Frage,
      // die man sich selbst gestellt hat.
      caption: monthly
        ? `${formatPercent(monthly.percent, 0)} vom Ziel`
        : hasTrend(data.monthResult)
          ? month.caption
          : undefined,
      to: paymentsListHref({ year: today.year, month: today.month }),
      drillLabel: "Zahlungen des aktuellen Monats anzeigen",
    });
  }
  if (data.average) {
    stats.push({
      label: "Ø pro Monat",
      value: <AmountText amount={data.average} />,
      caption: data.isCurrentYear ? "bisher" : "über 12 Monate",
    });
  }
  // Außerhalb des laufenden Jahres fehlt das Monatsfeld; die Zahl der
  // Zahlungen und ihre Breite füllen die Leiste — wie zuvor die vierte Kachel.
  if (!data.isCurrentYear) {
    stats.push({
      label: "Zahlungen",
      value: formatCountNumber(data.period.length),
      caption: formatCountNoun(distinctSecurities(data.period), "Asset", "Assets"),
    });
  }
  if (data.best) {
    stats.push({
      label: "Bester Monat",
      value: <AmountText amount={data.best.net} />,
      caption: data.isAll
        ? `${monthNameDe(data.best.month)} ${String(data.best.year)}`
        : monthNameDe(data.best.month),
      to: paymentsListHref({ year: data.best.year, month: data.best.month }),
      drillLabel: "Zahlungen des besten Monats anzeigen",
    });
  }

  return (
    <KpiHero
      label={`Dividenden ${label}`}
      value={<AmountText amount={data.net} />}
      to={paymentsListHref({ year: selection })}
      drillLabel={`Zahlungen ${label} anzeigen`}
      trend={
        hasTrend(data.yearResult) ? (
          <TrendPill
            tone={year.tone}
            title={
              data.isCurrentYear
                ? "gegenüber dem gleichen Zeitraum des Vorjahres"
                : "gegenüber dem Vorjahr"
            }
          >
            {year.caption}
          </TrendPill>
        ) : undefined
      }
      caption={hasTrend(data.yearResult) ? `${year.value} ${reference}` : undefined}
      footer={
        annual ? (
          <AnnualGoal progress={annual} />
        ) : // Erst wenn die Ziele geladen sind: Sonst stuende der Hinweis kurz da
        // und wiche dann dem Balken.
        goals !== undefined && typeof selection === "number" ? (
          <Link
            to="/ziele"
            className="rounded-sm text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Jahresziel für {selection} festlegen
          </Link>
        ) : undefined
      }
      stats={stats}
    />
  );
}

/**
 * Das Jahresziel als Balken mit einer Zeile darunter: erreichter Anteil links,
 * Restbetrag (oder Ergebnis) rechts. Führt zur Detailseite des Ziels.
 */
function AnnualGoal({ progress }: { progress: GoalProgress }) {
  const outcome =
    progress.status === "active" || progress.status === "upcoming"
      ? `noch ${formatMoney(progress.remaining)}`
      : statusLabel(progress.status);
  return (
    <Link
      to={`/ziele/${progress.goal.id}`}
      aria-label={`Jahresziel: ${accessibleProgressLabel(progress)}`}
      className="block space-y-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <GoalProgressBar progress={progress} showPercent={false} />
      <span className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground tabular-amount">
            {formatPercent(progress.percent, 1)}
          </span>{" "}
          vom Jahresziel {formatMoney(progress.target)}
        </span>
        <span className="shrink-0 tabular-amount">{outcome}</span>
      </span>
    </Link>
  );
}
