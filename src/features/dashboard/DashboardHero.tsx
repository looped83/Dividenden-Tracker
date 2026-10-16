import * as React from "react";
import { Link, useNavigate } from "react-router";
import { Target } from "lucide-react";
import { KpiStats, type KpiStat } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatPercent, type Money } from "@/lib/money";
import { computeGoalProgress, type GoalProgress } from "@/lib/goals";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { cn } from "@/lib/utils/cn";
import { useGoals } from "@/features/goals/hooks";
import { useCalendarEvents } from "@/features/calendar/hooks";
import { announcedForForecast } from "@/lib/calendar/summary";
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
  isoFromRef,
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
import {
  describeSelection,
  formatMonthYear,
  paymentsListHref,
  splitComparison,
} from "./format";
import { buildHeroSeries, type HeroChartKind, type HeroPoint } from "./heroSeries";
import { HeroChart } from "./HeroChart";

/**
 * Die zuletzt gewählte Diagrammsicht bleibt auf diesem Gerät stehen — eine
 * Ansichtsvorliebe wie das Farbschema, keine fachlichen Daten (ARCHITECTURE.md
 * §1). Gesperrter Speicher (privates Fenster) fällt auf „kumuliert" zurück.
 */
const KIND_KEY = "dividend-tracker:dashboard-chart";

function readStoredKind(): HeroChartKind {
  try {
    return window.localStorage.getItem(KIND_KEY) === "monthly" ? "monthly" : "cumulative";
  } catch {
    return "cumulative";
  }
}

function storeKind(kind: HeroChartKind): void {
  try {
    window.localStorage.setItem(KIND_KEY, kind);
  } catch {
    // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
  }
}

/**
 * Ob die Veränderung neben der Hauptzahl als Betrag oder Prozent steht —
 * ebenfalls eine Ansichtsvorliebe dieses Geräts, Voreinstellung Betrag.
 */
const TREND_KEY = "dividend-tracker:dashboard-trend";

type TrendUnit = "money" | "percent";

function readStoredUnit(): TrendUnit {
  try {
    return window.localStorage.getItem(TREND_KEY) === "percent" ? "percent" : "money";
  } catch {
    return "money";
  }
}

function storeUnit(unit: TrendUnit): void {
  try {
    window.localStorage.setItem(TREND_KEY, unit);
  } catch {
    // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
  }
}

/** Streifen, den das Diagramm oben für die Sichtwahl freihält. */
const CHART_TOGGLE_RESERVE = 28;

const KIND_OPTIONS: readonly SegmentOption<HeroChartKind>[] = [
  { value: "cumulative", label: "Kumuliert" },
  { value: "monthly", label: "Monatlich" },
];

interface DashboardHeroProps {
  payments: AnalyticsPayment[];
  selection: YearSelection;
  today: RefDate;
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
  const calendarEvents = useCalendarEvents().data;
  const navigate = useNavigate();
  const [kind, setKindState] = React.useState<HeroChartKind>(readStoredKind);
  const setKind = (next: HeroChartKind) => {
    setKindState(next);
    storeKind(next);
  };
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

  // Prognose (§9.7): Ankündigungen des Kalenders für die nächsten 30 Tage,
  // danach das Vorjahr. Ohne Kalender (oder solange er lädt) nur das Vorjahr.
  const forecast = React.useMemo(
    () =>
      annual && data.isCurrentYear && annual.status === "active"
        ? yearEndForecast(
            payments,
            today,
            announcedForForecast(calendarEvents ?? [], isoFromRef(today)),
          )
        : null,
    [annual, data.isCurrentYear, payments, today, calendarEvents],
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
        label: `Dividenden ${point.label}`,
        value: point.value,
        result: comparePeriods(point.value, point.prior),
        reference: `ggü. ${point.priorLabel}`,
        to: point.href,
        drillLabel: `Dividenden ${point.label} anzeigen`,
      }
    : {
        label: `Dividenden ${label}`,
        value: data.net,
        result: data.yearResult,
        reference: data.isCurrentYear ? "ggü. Vorjahreszeitraum" : "ggü. Vorjahr",
        to: paymentsListHref({ year: selection }),
        drillLabel: `Dividenden ${label} anzeigen`,
      };

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
      {/* Seit 1.20.0 steht die Veränderung direkt neben der Summe, als
          Betrag oder per Tipp als Prozent. Der Bezug („ggü.
          Vorjahreszeitraum") steckt im Tooltip und in der Ansage — eine
          eigene Zeile darunter sparte das nicht auf. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link
          to={head.to}
          aria-label={head.drillLabel}
          className="w-fit rounded-sm text-[2.5rem] font-bold leading-[1.05] tracking-[-0.035em] tabular-amount outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[3.25rem]"
        >
          <AmountText amount={head.value} />
        </Link>
        {hasTrend(head.result) && (
          <TrendToggle result={head.result} reference={head.reference} />
        )}
      </div>
      {data.isAll && !point && !hasTrend(head.result) && data.firstYear !== null && (
        <p className="mt-2 text-[0.9375rem] text-muted-foreground">
          {formatCountNoun(payments.length, "Dividende", "Dividenden")} seit{" "}
          {data.firstYear}
        </p>
      )}

      {annual ? (
        <AnnualGoal
          progress={annual}
          forecast={forecast?.forecast ?? null}
          announced={forecast?.announcedUntil ? forecast.announced : null}
        />
      ) : // Erst wenn die Ziele geladen sind: Sonst stuende der Hinweis kurz da
      // und wiche dann dem Balken.
      goals !== undefined && typeof selection === "number" ? (
        <Link
          to="/ziele"
          className="mt-5 inline-flex min-h-7 w-fit pointer-coarse:min-h-11 items-center gap-2 rounded-sm text-[0.9375rem] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Target className="size-4" aria-hidden />
          Jahresziel für {selection} festlegen
        </Link>
      ) : null}

      {/* Ohne Legende (seit 1.12.0): Die Vorjahreslinie trägt ihr Jahr am
          Ende, und der Kopf nennt beim Wischen beide Jahre. */}
      {/* Die Sichtwahl steht seit 1.19.0 oben links im Diagramm statt in einer
          eigenen Zeile darüber: Die Ecke war meist leer, und die Kennzahlen
          rücken nach oben. Das Diagramm hält den
          Streifen frei (`reserve`), damit auch ein hoher Januar in der
          Monatssicht nie darunter liegt. „Alle Jahre" hat keine Sicht. */}
      <div className={cn("relative", data.isAll ? "mt-6" : "mt-5")}>
        {!data.isAll && series.points.length > 0 && (
          <SegmentedControl
            variant="pill"
            label="Diagrammsicht"
            options={KIND_OPTIONS}
            value={kind}
            onChange={setKind}
            className="absolute left-0 top-0 z-10"
          />
        )}
        {series.points.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Für {label} liegen noch keine Dividenden vor.
          </p>
        ) : (
          <HeroChart
            series={series}
            active={active}
            onActiveChange={setActive}
            label={chartLabel}
            describe={describePoint}
            onOpen={(p) => void navigate(p.href)}
            reserve={data.isAll ? 0 : CHART_TOGGLE_RESERVE}
          />
        )}
        {series.kind === "cumulative" && series.points.length > 0 && (
          <div className="mt-1.5 flex justify-between px-1 text-xs text-muted-foreground">
            <span>Jan</span>
            <span>Dez</span>
          </div>
        )}
      </div>

      <KpiStats className="mt-5" stats={buildStats(data, monthly, today)} />
    </section>
  );
}

/**
 * Die Veränderung neben der Hauptzahl: grün mit ▲, rot mit ▼. Ein Tipp
 * wechselt zwischen Betrag und Prozent; die Wahl bleibt auf diesem Gerät.
 */
function TrendToggle({
  result,
  reference,
}: {
  result: ComparisonResult;
  reference: string;
}) {
  const [unit, setUnitState] = React.useState<TrendUnit>(readStoredUnit);
  const trend = splitComparison(result, "");
  const percent = trend.caption;
  const money = trend.value;
  const next: TrendUnit = unit === "money" ? "percent" : "money";
  const description = `${money} (${percent}) ${reference}`;
  return (
    <button
      type="button"
      onClick={() => {
        setUnitState(next);
        storeUnit(next);
      }}
      title={description}
      aria-label={`Veränderung ${description}. Als ${
        next === "percent" ? "Prozent" : "Betrag"
      } anzeigen`}
      className={cn(
        "relative inline-flex items-baseline gap-1 rounded-sm text-[1.0625rem] font-semibold tabular-amount outline-none after:absolute after:-inset-2.5 focus-visible:ring-2 focus-visible:ring-ring sm:text-xl",
        trend.tone === "positive" && "text-positive",
        trend.tone === "negative" && "text-negative",
        trend.tone === "neutral" && "text-muted-foreground",
      )}
    >
      {trend.tone !== "neutral" && (
        <svg
          viewBox="0 0 10 8"
          aria-hidden
          className={cn(
            "size-[0.6em] fill-current",
            trend.tone === "negative" && "rotate-180",
          )}
        >
          <path d="M5 0 10 8H0z" />
        </svg>
      )}
      {(unit === "money" ? money : percent).replace(/^[+\-−]\s?/, "")}
    </button>
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
): KpiStat[] {
  const stats: KpiStat[] = [];
  if (data.isAll || data.isCurrentYear) {
    const month = splitComparison(data.monthResult, "ggü. Vj.");
    stats.push({
      label: monthNameDe(today.month),
      value: <AmountText amount={data.monthNet} />,
      // Ein Monatsziel sagt mehr als der Vorjahresmonat: Es ist die Frage,
      // die man sich selbst gestellt hat. „vom Ziel" genügt — die Kachel
      // trägt den Monat als Überschrift; „vom Monatsziel" brach um.
      caption: monthly
        ? `${formatPercent(monthly.percent, 0)} vom Ziel`
        : hasTrend(data.monthResult)
          ? month.caption
          : undefined,
      to: paymentsListHref({ year: today.year, month: today.month }),
      drillLabel: "Dividenden des aktuellen Monats anzeigen",
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
      label: "Anzahl",
      value: formatCountNumber(data.period.length),
      caption: formatCountNoun(distinctSecurities(data.period), "Asset", "Assets"),
    });
  }
  if (data.best) {
    stats.push({
      label: "Bester Monat",
      value: <AmountText amount={data.best.net} />,
      caption: data.isAll
        ? formatMonthYear(data.best.year, data.best.month)
        : monthNameDe(data.best.month),
      to: paymentsListHref({ year: data.best.year, month: data.best.month }),
      drillLabel: "Dividenden des besten Monats anzeigen",
    });
  }
  return stats;
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
  announced,
}: {
  progress: GoalProgress;
  forecast: Money | null;
  /** Darin enthaltene angekündigte Beträge, falls der Kalender welche nennt. */
  announced: Money | null;
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
      aria-label={`Jahresziel: ${label}${
        forecast
          ? `. Prognose bis Jahresende ${formatMoney(forecast)}${
              announced ? `, davon ${formatMoney(announced)} angekündigt` : ""
            }`
          : ""
      }`}
      className="mt-5 block space-y-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 ring-offset-background"
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

/**
 * Ladegerüst in der Form des Kopfes: Zahl, Ziel, Diagramm, Kennzahlen — sonst
 * spränge die Seite, sobald die Daten da sind.
 */
export function DashboardHeroSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden>
      <Skeleton className="h-4 w-28" />
      <div className="mt-2 flex items-end gap-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="mt-6 h-1 w-full" />
      <Skeleton className="mt-8 h-36 w-full rounded-xl sm:h-52" />
      <Skeleton className="mt-5 h-20 w-full rounded-2xl" />
    </div>
  );
}
