import * as React from "react";
import { Link, useNavigate } from "react-router";
import { ArrowDownRight, ArrowUpRight, Target } from "lucide-react";
import { AmountText } from "@/components/money/AmountText";
import { ChartDataTable, ChartRowHeader } from "@/components/charts/chartTable";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatPercent, type Money } from "@/lib/money";
import { computeGoalProgress, type GoalProgress } from "@/lib/goals";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { cn } from "@/lib/utils/cn";
import { useGoals } from "@/features/goals/hooks";
import {
  accessibleProgressLabel,
  statusLabel,
  statusTone,
} from "@/features/goals/format";
import {
  averagePerMonth,
  bestMonthAllTime,
  bestMonthInYear,
  comparePeriods,
  currentMonthAggregate,
  currentMonthComparison,
  distinctSecurities,
  firstPayDate,
  monthNameDe,
  selectedPeriodAggregate,
  selectedYearComparison,
  yearEndForecast,
  yearOf,
  type AnalyticsPayment,
  type ComparisonResult,
  type RefDate,
  type YearSelection,
} from "@/lib/statistics";
import { describeSelection, paymentsListHref, splitComparison } from "./format";
import { buildHeroSeries, type HeroChartKind, type HeroPoint } from "./heroSeries";
import { HeroChart } from "./HeroChart";

interface DashboardHeroProps {
  payments: AnalyticsPayment[];
  selection: YearSelection;
  today: RefDate;
}

interface Stat {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  to?: string;
  drillLabel?: string;
}

/** Nur ein echter Prozentvergleich (oder „neu") ergibt eine Veränderung. */
function hasTrend(result: ComparisonResult): boolean {
  return result.kind === "percent" || result.kind === "new";
}

/**
 * Kopf der Übersicht (UX_AND_DESIGN_SYSTEM.md „Dashboard", ab 1.7.0): die
 * Dividenden des gewählten Zeitraums als Hauptzahl, darunter Veränderung,
 * Jahresziel und das Diagramm, dann eine Fläche mit drei Kennzahlen.
 *
 * Er steht ohne Kartenrahmen auf der Seite — die Größe trägt die Rangfolge.
 * Das Diagramm gehört zur Zahl: Wer darüber fährt oder wischt, sieht oben den
 * Stand des gewählten Punktes samt Vergleich, und der Betrag führt zu genau
 * diesen Zahlungen. Ohne Auswahl zeigt der Kopf den Zeitraum.
 *
 * **Gezeigt wird nur, was zum gewählten Zeitraum gehört:** Der laufende Monat
 * und sein Ziel erscheinen nur im laufenden Jahr und bei „Alle Jahre", ein
 * Jahresziel nur zu einem Jahr, die Prognose nur zum laufenden Jahr.
 */
export function DashboardHero({ payments, selection, today }: DashboardHeroProps) {
  const goals = useGoals().data;
  const navigate = useNavigate();
  const [kind, setKind] = React.useState<HeroChartKind>("cumulative");
  // Die Auswahl gehört zu einer Datenreihe: Wechseln Jahr oder Sicht, beginnt
  // der Kopf wieder beim Zeitraum (abgeleitet statt per Effekt zurückgesetzt).
  const [selected, setSelected] = React.useState<{
    series: unknown;
    index: number;
  } | null>(null);

  const data = React.useMemo(() => {
    const isAll = selection === "all";
    const { current, prior } = selectedYearComparison(payments, selection, today);
    const monthCompare = currentMonthComparison(payments, today);
    return {
      isAll,
      isCurrentYear: selection === today.year,
      net: selectedPeriodAggregate(payments, selection).net,
      period: isAll ? payments : payments.filter((p) => yearOf(p.payDate) === selection),
      current,
      prior,
      yearResult: comparePeriods(current, prior),
      monthNet: currentMonthAggregate(payments, today).net,
      monthResult: comparePeriods(monthCompare.current, monthCompare.prior),
      best:
        selection === "all"
          ? bestMonthAllTime(payments)
          : bestMonthInYear(payments, selection),
      average: selection === "all" ? null : averagePerMonth(payments, selection, today),
      firstYear: (() => {
        const first = firstPayDate(payments);
        return first ? yearOf(first) : null;
      })(),
    };
  }, [payments, selection, today]);

  const series = React.useMemo(
    () => buildHeroSeries(payments, selection, today, kind),
    [payments, selection, today, kind],
  );

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

  const forecast = React.useMemo(
    () =>
      annual && data.isCurrentYear && annual.status === "active"
        ? yearEndForecast(payments, today).forecast
        : null,
    [annual, data.isCurrentYear, payments, today],
  );

  const label = describeSelection(selection);
  const active = selected?.series === series ? selected.index : null;
  const setActive = (index: number | null) => {
    setSelected(index === null ? null : { series, index });
  };
  const point = active === null ? null : (series.points[active] ?? null);

  // Was der Kopf zeigt: der gewählte Punkt oder der Zeitraum.
  const head = point
    ? {
        label: point.label,
        value: point.value,
        result: comparePeriods(point.value, point.prior),
        reference: `ggü. ${point.priorLabel}`,
        to: point.href,
        drillLabel: `Zahlungen ${point.label} anzeigen`,
      }
    : {
        label: `Dividenden ${label}`,
        value: data.net,
        result: data.yearResult,
        reference: data.isCurrentYear ? "ggü. Vorjahreszeitraum" : "ggü. Vorjahr",
        to: paymentsListHref({ year: selection }),
        drillLabel: `Zahlungen ${label} anzeigen`,
      };
  const trend = splitComparison(head.result, "");

  const describePoint = (p: HeroPoint): string => {
    const result = comparePeriods(p.value, p.prior);
    const change = splitComparison(result, "");
    return hasTrend(result)
      ? `${p.label}: ${formatMoney(p.value)}, ${change.value} (${change.caption}) ggü. ${p.priorLabel}`
      : `${p.label}: ${formatMoney(p.value)}`;
  };

  const chartLabel =
    series.kind === "years"
      ? "Dividenden je Jahr. Pfeiltasten wählen ein Jahr."
      : series.kind === "cumulative"
        ? `Dividenden ${label} kumuliert gegenüber ${String(series.year - 1)}. Pfeiltasten wählen einen Monat.`
        : `Dividenden ${label} je Monat gegenüber ${String(series.year - 1)}. Pfeiltasten wählen einen Monat.`;

  return (
    <section aria-label="Kennzahlen" className="flex flex-col">
      <p className="text-[0.9375rem] font-medium text-muted-foreground">{head.label}</p>
      <Link
        to={head.to}
        aria-label={head.drillLabel}
        className="mt-1 w-fit rounded-sm text-[2.5rem] font-bold leading-[1.05] tracking-[-0.035em] tabular-amount outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[3.25rem]"
      >
        <AmountText amount={head.value} />
      </Link>
      <p className="mt-2 flex min-h-5 flex-wrap items-baseline gap-x-2 text-[0.9375rem]">
        {hasTrend(head.result) ? (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 self-center font-semibold tabular-amount",
                trend.tone === "positive" && "text-positive",
                trend.tone === "negative" && "text-negative",
                trend.tone === "neutral" && "text-muted-foreground",
              )}
            >
              {trend.tone !== "neutral" &&
                (trend.tone === "negative" ? (
                  <ArrowDownRight className="size-4" aria-hidden strokeWidth={2.5} />
                ) : (
                  <ArrowUpRight className="size-4" aria-hidden strokeWidth={2.5} />
                ))}
              {trend.caption}
            </span>
            <span className="text-muted-foreground tabular-amount">
              {trend.value} {head.reference}
            </span>
          </>
        ) : (
          data.isAll &&
          !point &&
          data.firstYear !== null && (
            <span className="text-muted-foreground">
              {formatCountNoun(payments.length, "Zahlung", "Zahlungen")} seit{" "}
              {data.firstYear}
            </span>
          )
        )}
      </p>

      {annual ? (
        <AnnualGoal progress={annual} forecast={forecast} />
      ) : // Erst wenn die Ziele geladen sind: Sonst stuende der Hinweis kurz da
      // und wiche dann dem Balken.
      goals !== undefined && typeof selection === "number" ? (
        <Link
          to="/ziele"
          className="mt-4 inline-flex min-h-7 w-fit items-center gap-2 rounded-sm text-[0.9375rem] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Target className="size-4" aria-hidden />
          Jahresziel für {selection} festlegen
        </Link>
      ) : null}

      <div className="mt-5 flex min-h-9 items-center justify-between gap-3">
        <Legend kind={series.kind} year={typeof selection === "number" ? selection : 0} />
        {!data.isAll && <KindToggle kind={kind} onChange={setKind} />}
      </div>
      <div className="mt-3">
        {series.points.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Für {label} liegen noch keine Dividendeneingänge vor.
          </p>
        ) : (
          <HeroChart
            series={series}
            active={active}
            onActiveChange={setActive}
            label={chartLabel}
            describe={describePoint}
            onOpen={(p) => void navigate(p.href)}
          />
        )}
        {series.kind === "cumulative" && series.points.length > 0 && (
          <div className="mt-1.5 flex justify-between px-1 text-xs text-muted-foreground">
            <span>Jan</span>
            <span>Dez</span>
          </div>
        )}
        <div className="mt-3">
          <ChartDataTable>
            {series.kind === "years" ? (
              <YearTable bars={series.bars} />
            ) : (
              <MonthTable months={series.months} year={series.year} />
            )}
          </ChartDataTable>
        </div>
      </div>

      <Stats stats={buildStats(data, monthly, today)} />
    </section>
  );
}

function buildStats(
  data: {
    isAll: boolean;
    isCurrentYear: boolean;
    period: AnalyticsPayment[];
    monthNet: Money;
    monthResult: ComparisonResult;
    best: { net: Money; year: number; month: number } | null;
    average: Money | null;
  },
  monthly: GoalProgress | null,
  today: RefDate,
): Stat[] {
  const stats: Stat[] = [];
  if (data.isAll || data.isCurrentYear) {
    const month = splitComparison(data.monthResult, "ggü. Vj.");
    stats.push({
      label: monthNameDe(today.month),
      value: <AmountText amount={data.monthNet} />,
      // Ein Monatsziel sagt mehr als der Vorjahresmonat: Es ist die Frage,
      // die man sich selbst gestellt hat. „Monatsziel" statt „Ziel", damit es
      // sich nicht mit dem Jahresziel darüber verwechseln lässt.
      caption: monthly
        ? `${formatPercent(monthly.percent, 0)} vom Monatsziel`
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
  // Zahlungen und ihre Breite füllen die Fläche.
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
  return stats;
}

/**
 * Drei Kennzahlen auf einer gedämpften Fläche — gleich gebaut, ohne
 * Trennlinien. Erst die Beschriftung, dann der Wert (`dt`/`dd`), damit
 * Sprachausgaben beides zusammen nennen. Ein Drill-down macht das ganze Feld
 * zur Tippfläche.
 */
function Stats({ stats }: { stats: Stat[] }) {
  if (stats.length === 0) return null;
  return (
    <dl
      className={cn(
        "mt-5 grid gap-1 rounded-2xl bg-muted p-1.5",
        stats.length === 1
          ? "grid-cols-1"
          : stats.length === 2
            ? "grid-cols-2"
            : "grid-cols-3",
      )}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={cn(
            "relative flex min-w-0 flex-col rounded-xl px-2.5 py-2 sm:px-4 sm:py-3",
            stat.to !== undefined &&
              "transition-colors hover:bg-accent motion-reduce:transition-none",
          )}
        >
          <dt className="truncate text-[0.8125rem] text-muted-foreground">
            {stat.label}
          </dt>
          <dd className="mt-0.5 truncate text-[1.0625rem] font-semibold tracking-[-0.01em] tabular-amount">
            {stat.to !== undefined ? (
              <Link
                to={stat.to}
                aria-label={stat.drillLabel ?? stat.label}
                className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
              >
                {stat.value}
              </Link>
            ) : (
              stat.value
            )}
          </dd>
          {stat.caption !== undefined && (
            <dd className="mt-0.5 text-[0.8125rem] text-muted-foreground">
              {stat.caption}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/**
 * Das Jahresziel als schmaler Balken unter der Summe, auf die es sich bezieht.
 * Im laufenden Jahr setzt eine gestrichelte Verlängerung die **Prognose** fort
 * (CALCULATION_RULES.md §9.7): Sie beantwortet, ob das Ziel erreichbar ist —
 * „40 % erreicht" allein sagt das im Oktober nicht. Führt zur Zielseite.
 */
function AnnualGoal({
  progress,
  forecast,
}: {
  progress: GoalProgress;
  forecast: Money | null;
}) {
  const reached = Math.min(100, Math.max(0, progress.percent.toNumber()));
  const projected = forecast
    ? Math.min(
        100,
        Math.max(
          reached,
          forecast.toDecimal().div(progress.target.toDecimal()).times(100).toNumber(),
        ),
      )
    : reached;
  const tone = statusTone(progress.status);
  const outcome =
    progress.status === "active" || progress.status === "upcoming"
      ? `noch ${formatMoney(progress.remaining)}`
      : statusLabel(progress.status);
  const label = accessibleProgressLabel(progress);
  return (
    <Link
      to={`/ziele/${progress.goal.id}`}
      aria-label={`Jahresziel: ${label}${forecast ? `. Prognose bis Jahresende ${formatMoney(forecast)}` : ""}`}
      className="mt-4 block space-y-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 ring-offset-background"
    >
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(reached)}
        aria-valuetext={label}
        className="flex h-1 w-full overflow-hidden rounded-full bg-border"
      >
        <span
          className={cn(
            "h-full",
            tone === "positive" && "bg-positive",
            tone === "negative" && "bg-negative",
            tone === "neutral" && "bg-foreground",
          )}
          style={{ width: `${String(reached)}%` }}
        />
        {projected > reached && (
          <span
            className="h-full bg-[repeating-linear-gradient(90deg,var(--series-prior)_0_3px,transparent_3px_5px)]"
            style={{ width: `${String(projected - reached)}%` }}
          />
        )}
      </span>
      <span className="flex items-baseline justify-between gap-3 text-[0.8125rem] text-muted-foreground">
        <span className="min-w-0 truncate">
          <span className="font-semibold text-foreground tabular-amount">
            {formatPercent(progress.percent, 1)}
          </span>{" "}
          {/* „vom Ziel" statt „vom Jahresziel": Neben der Prognose passte die
              Zeile auf dem Telefon sonst nicht. Verwechslung ausgeschlossen —
              das Monatsziel heißt in der Fläche darunter „Monatsziel". */}
          vom Ziel {formatMoney(progress.target)}
        </span>
        <span className="shrink-0 tabular-amount">
          {forecast ? (
            <>
              Prognose{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(forecast)}
              </span>
            </>
          ) : (
            outcome
          )}
        </span>
      </span>
    </Link>
  );
}

function Legend({
  kind,
  year,
}: {
  kind: "cumulative" | "monthly" | "years";
  year: number;
}) {
  if (kind === "years") return <span />;
  const swatch =
    kind === "cumulative"
      ? [
          <span key="c" className="h-0.5 w-3 rounded-full bg-foreground" />,
          <span
            key="p"
            className="h-0.5 w-3 bg-[repeating-linear-gradient(90deg,var(--series-prior)_0_2px,transparent_2px_4px)]"
          />,
        ]
      : [
          <span key="c" className="size-2 rounded-[2px] bg-foreground" />,
          <span key="p" className="size-2 rounded-[2px] bg-series-prior" />,
        ];
  return (
    <span className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
      <span className="inline-flex items-center gap-1.5">
        {swatch[0]}
        {year}
      </span>
      <span className="inline-flex items-center gap-1.5">
        {swatch[1]}
        {year - 1}
      </span>
    </span>
  );
}

/**
 * Umschalter der Diagrammsicht. 32px hoch, die Tippfläche reicht per
 * Pseudo-Element auf 44px (UX_AND_DESIGN_SYSTEM.md §7).
 */
function KindToggle({
  kind,
  onChange,
}: {
  kind: HeroChartKind;
  onChange: (next: HeroChartKind) => void;
}) {
  const options: [HeroChartKind, string][] = [
    ["cumulative", "Kumuliert"],
    ["monthly", "Monatlich"],
  ];
  return (
    <div
      role="group"
      aria-label="Diagrammsicht"
      className="inline-flex rounded-full bg-muted p-0.5"
    >
      {options.map(([value, text]) => (
        <button
          key={value}
          type="button"
          aria-pressed={kind === value}
          onClick={() => {
            onChange(value);
          }}
          className={cn(
            "relative h-8 rounded-full px-3 text-[0.8125rem] font-semibold outline-none",
            "after:absolute after:inset-x-0 after:-inset-y-1.5",
            "focus-visible:ring-2 focus-visible:ring-ring",
            kind === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function MonthTable({
  months,
  year,
}: {
  months: { month: number; current: Money | null; prior: Money }[];
  year: number;
}) {
  return (
    <Table>
      <caption className="sr-only">
        Monatliche Netto-Dividenden {year} und {year - 1}
      </caption>
      <TableHeader>
        <TableRow>
          <TableHead>Monat</TableHead>
          <TableHead className="text-right">{year}</TableHead>
          <TableHead className="text-right">{year - 1}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {months.map((row) => (
          <TableRow key={row.month}>
            <ChartRowHeader>{monthNameDe(row.month)}</ChartRowHeader>
            <TableCell className="text-right tabular-nums">
              {row.current ? formatMoney(row.current) : "noch nicht begonnen"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(row.prior)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function YearTable({ bars }: { bars: { year: number; value: Money; count: number }[] }) {
  return (
    <Table>
      <caption className="sr-only">Netto-Dividenden je Jahr</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Jahr</TableHead>
          <TableHead className="text-right">Nettodividende</TableHead>
          <TableHead className="text-right">Zahlungen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bars.map((row) => (
          <TableRow key={row.year}>
            <ChartRowHeader>{row.year}</ChartRowHeader>
            <TableCell className="text-right tabular-nums">
              {formatMoney(row.value)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCountNumber(row.count)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Ladegerüst in der Form des Kopfes: Zahl, Ziel, Diagramm, Kennzahlen — sonst
 * spränge die Seite, sobald die Daten da sind.
 */
export function DashboardHeroSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-2 h-10 w-56" />
      <Skeleton className="mt-3 h-4 w-44" />
      <Skeleton className="mt-5 h-1 w-full" />
      <Skeleton className="mt-8 h-36 w-full rounded-xl sm:h-52" />
      <Skeleton className="mt-5 h-20 w-full rounded-2xl" />
    </div>
  );
}
