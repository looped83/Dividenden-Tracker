import * as React from "react";
import { Link } from "react-router";
import { CalendarRange, ChevronDown, Plus, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Section, SectionButton } from "@/components/ui/section";
import { ListGroup, ListItemBody, ListRow, ListTile } from "@/components/ui/list";
import { KpiHero, KpiHeroSkeleton, type KpiStat } from "@/components/domain/KpiHero";
import { PageHeader } from "@/components/layout/PageHeader";
import { DeriveMonthlyGoalsDialog } from "./DeriveMonthlyGoalsDialog";
import { GapPurchaseBox } from "./GapPurchaseBox";
import { GoalBarChart, type GoalBarDatum } from "@/features/statistics/components/charts";
import { useForecastSettings } from "@/features/securities/forecastSettings";
import { useOpenMonths } from "@/lib/hooks/useOpenMonths";
import { useToday } from "@/lib/hooks/useToday";
import {
  annualGoalHistory,
  computeGoalCourse,
  computeGoalProgress,
  suggestAnnualGoal,
  trailingMonthlyAverage,
  type ExpectedRest,
  type Goal,
  type GoalCourse,
  type GoalProgress,
  type GoalSuggestion,
} from "@/lib/goals";
import {
  EUR,
  Money,
  MoneyDecimal,
  formatMoney,
  formatMoneyWhole,
  formatPercent,
} from "@/lib/money";
import {
  monthNameDe,
  monthNameDeShort,
  monthlyBuckets,
  type AnalyticsPayment,
  type RefDate,
} from "@/lib/statistics";
import { cn } from "@/lib/utils/cn";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import {
  useGoalProgressPayments,
  useDerivedMonthlyGoals,
  useGoals,
  useYearEndForecast,
  type GoalWithMeta,
} from "./hooks";
import { GoalFormDialog } from "./GoalFormDialog";
import {
  achievementText,
  courseLabel,
  courseVariant,
  goalTitle,
  statusLabel,
  statusTone,
} from "./format";

const badgeVariantByTone = {
  positive: "positive",
  neutral: "primary",
  negative: "negative",
} as const;

/**
 * Die Zielseite (seit 2.4.0): **Wie gut treffe ich meine Ziele, und wohin
 * geht es?** — statt dreier Reiter mit Zielkarten, die man einmal einrichtete
 * und danach nie wieder öffnete.
 *
 * Oben der Weg zum Langfristziel des Schneeballs (gepflegt in Bestand ›
 * Prognose, hier nur der Ist-Stand), darunter die Zielbilanz über die Jahre,
 * das laufende Jahr Monat für Monat und die Liste aller Ziele. Ob das
 * laufende Jahr auf Kurs ist, beantwortet weiterhin die Übersicht; die
 * Prognose hier ist dieselbe (CALCULATION_RULES.md §9.7).
 */
export function GoalsPage() {
  const today = useToday();
  const goalsQuery = useGoals();
  const { payments, isLoading: paymentsLoading } = useGoalProgressPayments();
  const settings = useForecastSettings().data;
  const { forecast, rest } = useYearEndForecast(payments, today);
  const [form, setForm] = React.useState<{
    open: boolean;
    preset?: GoalSuggestion | undefined;
  }>({ open: false });

  const goals = React.useMemo(() => goalsQuery.data ?? [], [goalsQuery.data]);

  // Stabil je Vorschlag: Der Dialog setzt sich bei einer neuen Vorbelegung
  // zurueck — ein neues Objekt bei jedem Rendern verwarf sonst die Eingabe.
  const preset = React.useMemo(
    () => form.preset && { year: form.preset.year, targetAmount: form.preset.amount },
    [form.preset],
  );

  const openCreate = (suggestion?: GoalSuggestion) => {
    setForm({ open: true, preset: suggestion });
  };

  const heading = (
    <PageHeader
      title="Ziele"
      actions={
        // Umriss wie die Jahresauswahl der Uebersicht; gefuellt bleibt allein
        // das Erfassen in der Navigation.
        <Button
          variant="outline"
          onClick={() => {
            openCreate();
          }}
        >
          <Plus aria-hidden /> Ziel anlegen
        </Button>
      }
    />
  );

  let content: React.ReactNode;
  if (goalsQuery.isLoading || paymentsLoading) {
    content = (
      <div className="space-y-10" aria-busy="true">
        <span className="sr-only">Ziele werden geladen …</span>
        <KpiHeroSkeleton />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  } else if (goalsQuery.isError) {
    content = (
      <EmptyState
        icon={Target}
        title="Ziele konnten nicht geladen werden"
        description={getErrorMessage(
          goalsQuery.error,
          "Beim Laden der Ziele ist ein Fehler aufgetreten.",
        )}
        action={
          <Button onClick={() => void goalsQuery.refetch()}>Erneut versuchen</Button>
        }
      />
    );
  } else if (goals.length === 0) {
    content = (
      <EmptyState
        icon={Target}
        title="Noch keine Ziele angelegt"
        description="Lege ein Jahres- oder Monatsziel fest, um deine tatsächlich erhaltenen Dividendeneinnahmen damit zu vergleichen."
        action={
          <Button
            onClick={() => {
              openCreate();
            }}
          >
            <Plus aria-hidden /> Erstes Ziel anlegen
          </Button>
        }
      />
    );
  } else {
    content = (
      <GoalsOverview
        goals={goals}
        payments={payments}
        today={today}
        forecast={forecast}
        rest={rest}
        targetMonthly={settings?.targetMonthly ?? null}
        onSuggest={openCreate}
      />
    );
  }

  return (
    <div className="space-y-6">
      {heading}
      {content}
      <GoalFormDialog
        open={form.open}
        onOpenChange={(open) => {
          setForm((current) => ({ ...current, open }));
        }}
        goal={null}
        preset={preset}
      />
    </div>
  );
}

type Forecast = ReturnType<typeof useYearEndForecast>["forecast"];
type Courses = ReadonlyMap<string, GoalCourse>;

function GoalsOverview({
  goals,
  payments,
  today,
  forecast,
  rest,
  targetMonthly,
  onSuggest,
}: {
  goals: readonly GoalWithMeta[];
  payments: readonly AnalyticsPayment[];
  today: RefDate;
  forecast: Forecast;
  rest: ExpectedRest;
  targetMonthly: number | null;
  onSuggest: (suggestion: GoalSuggestion) => void;
}) {
  const data = React.useMemo(() => {
    const history = annualGoalHistory(goals, payments, today);
    const progress = goals.map((goal) => computeGoalProgress(goal, payments, today));
    const courses = new Map<string, GoalCourse>();
    for (const item of progress) {
      const course = computeGoalCourse(item, rest, today);
      if (course) courses.set(item.goal.id, course);
    }
    return {
      history,
      courses,
      average: trailingMonthlyAverage(payments, today),
      suggestion: suggestAnnualGoal(goals, payments, today, forecast.forecast),
      list: groupForList(progress, today.year),
      years: toYearData(history, forecast, courses, today),
      months: toMonthData(goals, payments, forecast, courses, today),
    };
  }, [goals, payments, today, forecast, rest]);

  const current = data.history.find((p) => p.goal.year === today.year) ?? null;
  const next = data.history.find((p) => p.goal.year === today.year + 1) ?? null;
  const monthlyGoalsThisYear = goals.some(
    (goal) => goal.goalType === "monthly" && goal.year === today.year,
  );
  const showHistory = data.history.length > 0;
  const showMonths = current !== null || monthlyGoalsThisYear;
  const hasCharts = showHistory || showMonths;
  const currentCourse = current ? (data.courses.get(current.goal.id) ?? null) : null;
  const derived = useDerivedMonthlyGoals({
    annual: current?.goal ?? null,
    goals,
    payments,
    forecast,
    today,
  });
  const [deriving, setDeriving] = React.useState(false);

  return (
    <div className="space-y-10 lg:space-y-12">
      <GoalsHero
        forecast={forecast}
        course={currentCourse}
        average={data.average}
        targetMonthly={targetMonthly}
        current={current}
        next={next}
        year={today.year}
      />

      {current && (
        <GapPurchaseBox
          goal={current.goal}
          target={current.target}
          course={currentCourse}
          today={today}
        />
      )}

      {data.suggestion && (
        <SuggestionBox
          suggestion={data.suggestion}
          onAccept={() => {
            if (data.suggestion) onSuggest(data.suggestion);
          }}
        />
      )}

      {/* Desktop wie die Übersicht (ab xl, darunter wurden die Monatsbalken zu schmal): Diagramme links, die Liste rechts in
          fester Breite — sonst stand „Alle Ziele" erst nach zwei Diagrammen. */}
      <div
        className={cn(
          "flex flex-col gap-10",
          hasCharts &&
            "xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-x-16",
        )}
      >
        {hasCharts && (
          <div className="space-y-10 lg:space-y-12">
            {showHistory && (
              <Section title="Zielbilanz">
                <GoalBarChart
                  data={data.years}
                  ariaLabel="Jahresziele und erhaltene Nettodividende je Jahr"
                  categoryHeader="Jahr"
                />
              </Section>
            )}

            {showMonths && (
              <Section
                title={`${String(today.year)} Monat für Monat`}
                action={
                  derived.length > 0 ? (
                    <SectionButton
                      icon={CalendarRange}
                      aria-haspopup="dialog"
                      onClick={() => {
                        setDeriving(true);
                      }}
                    >
                      Monatsziele
                    </SectionButton>
                  ) : undefined
                }
                description={
                  current && currentCourse
                    ? `Hochrechnung ${formatMoneyWhole(currentCourse.expected)} von ${formatMoneyWhole(current.target)} · ${courseLabel(currentCourse.kind)}`
                    : undefined
                }
              >
                <GoalBarChart
                  data={data.months}
                  ariaLabel={`Monatsziele und erhaltene Nettodividende ${String(today.year)} je Monat`}
                  categoryHeader="Monat"
                />
              </Section>
            )}
          </div>
        )}

        {current && (
          <DeriveMonthlyGoalsDialog
            open={deriving}
            onOpenChange={setDeriving}
            year={today.year}
            derived={derived}
          />
        )}

        <Section title="Alle Ziele">
          <GoalList list={data.list} courses={data.courses} />
        </Section>
      </div>
    </div>
  );
}

const HUNDRED = new MoneyDecimal(100);

/**
 * Kopf (seit 2.34.0): Wo landet das laufende Jahr? Die Hochrechnung (§13.1)
 * gegen das Jahresziel, daneben das bisher Erhaltene, der Stand zum
 * Langfristziel des Schneeballs und das Ziel fürs nächste Jahr. Den Ø der
 * letzten zwölf Monate zeigt der Fortschritt; bis 2.33 stand er hier doppelt.
 */
function GoalsHero({
  forecast,
  course,
  average,
  targetMonthly,
  current,
  next,
  year,
}: {
  forecast: Forecast;
  course: GoalCourse | null;
  average: Money;
  targetMonthly: number | null;
  current: GoalProgress | null;
  next: GoalProgress | null;
  year: number;
}) {
  const expected = course?.expected ?? forecast.forecast;
  const expectedShare = current
    ? expected.toDecimal().div(current.target.toDecimal()).times(HUNDRED)
    : null;
  const target =
    targetMonthly !== null && targetMonthly > 0
      ? Money.fromDecimal(new MoneyDecimal(targetMonthly), EUR)
      : null;
  const longTerm = target
    ? average.toDecimal().div(target.toDecimal()).times(HUNDRED)
    : null;

  const stats: KpiStat[] = [
    current
      ? {
          label: "Erhalten",
          value: formatMoneyWhole(current.actual),
          caption: `${formatPercent(current.percent, 0)} erreicht`,
        }
      : {
          label: "Erhalten",
          value: formatMoneyWhole(forecast.received),
          caption: "bis heute",
        },
    longTerm && target
      ? {
          label: "Langfristziel",
          value: formatPercent(longTerm, 0),
          caption: `von ${formatMoneyWhole(target)}`,
          to: "/planer/schneeball",
          drillLabel: "Langfristziel im Schneeball öffnen",
        }
      : {
          label: "Langfristziel",
          value: "–",
          caption: "nicht festgelegt",
          to: "/planer/schneeball",
          drillLabel: "Langfristziel im Schneeball festlegen",
        },
    next
      ? {
          label: `Ziel ${String(year + 1)}`,
          value: formatMoneyWhole(next.target),
          caption: current
            ? `${next.target.compareTo(current.target) >= 0 ? "+" : "−"}${formatPercent(
                next.target
                  .toDecimal()
                  .div(current.target.toDecimal())
                  .minus(1)
                  .abs()
                  .times(HUNDRED),
                0,
              )}`
            : undefined,
          to: `/ziele/${next.goal.id}`,
          drillLabel: `Jahresziel ${String(year + 1)} öffnen`,
        }
      : { label: `Ziel ${String(year + 1)}`, value: "–", caption: "offen" },
  ];

  return (
    <KpiHero
      label={`Hochrechnung ${String(year)}`}
      value={formatMoneyWhole(expected)}
      caption={
        current && expectedShare
          ? `${formatPercent(expectedShare, 0)} vom Ziel ${formatMoneyWhole(current.target)}${
              course ? ` · ${courseLabel(course.kind)}` : ""
            }`
          : `Ziel ${String(year)} nicht festgelegt`
      }
      {...(current && {
        to: `/ziele/${current.goal.id}`,
        drillLabel: `Jahresziel ${String(year)} öffnen`,
      })}
      footer={
        expectedShare ? (
          <GoalBar
            percent={expectedShare.toNumber()}
            label={`Hochrechnung ${String(year)} im Verhältnis zum Jahresziel`}
          />
        ) : undefined
      }
      stats={stats}
    />
  );
}

function GoalBar({ percent, label }: { percent: number; label: string }) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      className="flex h-1 w-full overflow-hidden rounded-full bg-border"
    >
      <span
        className="h-full rounded-full bg-primary"
        style={{ width: `${String(width)}%` }}
      />
    </span>
  );
}

function SuggestionBox({
  suggestion,
  onAccept,
}: {
  suggestion: GoalSuggestion;
  onAccept: () => void;
}) {
  const basis = suggestion.growth
    ? `Prognose ${String(suggestion.year - 1)} ${formatMoneyWhole(suggestion.forecast)} plus ${formatPercent(
        suggestion.growth.growth.times(HUNDRED),
        0,
      )} Ø Wachstum ${String(suggestion.growth.from)}–${String(suggestion.growth.to)}`
    : `Prognose ${String(suggestion.year)}`;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        <p className="font-semibold">
          Vorschlag für {suggestion.year}: {formatMoneyWhole(suggestion.amount)}
        </p>
        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{basis}</p>
      </div>
      <Button className="shrink-0" onClick={onAccept}>
        Übernehmen
      </Button>
    </div>
  );
}

function GoalRow({
  progress,
  course,
}: {
  progress: GoalProgress;
  course: GoalCourse | null;
}) {
  const { goal, status } = progress;
  const isMonthly = goal.goalType === "monthly" && goal.month !== null;
  const upcoming = status === "upcoming";
  return (
    <ListRow asChild>
      <Link to={`/ziele/${goal.id}`}>
        <ListItemBody
          leading={
            <ListTile
              primary={isMonthly ? monthNameDeShort(goal.month ?? 1) : String(goal.year)}
              secondary={isMonthly ? String(goal.year) : undefined}
            />
          }
          title={
            <>
              {/* Kurz, weil die Kachel den Zeitraum schon zeigt; so passt das
                  Abzeichen in die Titelzeile und jede Zeile bleibt zweizeilig
                  (vorher brach der Betrag mobil je nach Länge mal um, mal nicht). */}
              <span aria-hidden>Dividendenziel</span>
              <span className="sr-only">{goalTitle(goal)}</span>
              {course ? (
                <Badge
                  variant={courseVariant(course.kind)}
                  className="ml-2 align-[0.125em]"
                >
                  {courseLabel(course.kind)}
                </Badge>
              ) : (
                <Badge
                  variant={badgeVariantByTone[statusTone(status)]}
                  className={cn(
                    "ml-2 align-[0.125em]",
                    statusTone(status) === "neutral" && "bg-muted",
                  )}
                >
                  {statusLabel(status)}
                </Badge>
              )}
            </>
          }
          meta={
            <span className="tabular-amount">
              {upcoming
                ? `Ziel ${formatMoney(progress.target)}`
                : `${formatMoney(progress.actual)} von ${formatMoney(progress.target)}`}
            </span>
          }
          trailing={upcoming ? undefined : achievementText(progress.percent)}
        />
      </Link>
    </ListRow>
  );
}

interface GoalYear {
  year: number;
  /** Das Jahresziel (höchstens eins je Jahr) vor den Monatszielen. */
  annual: GoalProgress[];
  /** Neuester Monat zuerst. */
  months: GoalProgress[];
}

/**
 * Neueste Jahre zuerst. `recent` sind das Vorjahr und alles danach, `older`
 * die Jahre davor — sie klappen unter „Ältere Ziele“ zusammen.
 */
function groupForList(
  items: readonly GoalProgress[],
  currentYear: number,
): { recent: GoalYear[]; older: GoalYear[] } {
  const byYear = new Map<number, GoalYear>();
  for (const item of items) {
    const { year } = item.goal;
    let entry = byYear.get(year);
    if (!entry) {
      entry = { year, annual: [], months: [] };
      byYear.set(year, entry);
    }
    if (item.goal.goalType === "annual") entry.annual.push(item);
    else entry.months.push(item);
  }
  const years = [...byYear.values()].toSorted((a, b) => b.year - a.year);
  for (const entry of years) {
    entry.months.sort((a, b) => (b.goal.month ?? 0) - (a.goal.month ?? 0));
  }
  return {
    recent: years.filter((entry) => entry.year >= currentYear - 1),
    older: years.filter((entry) => entry.year < currentYear - 1),
  };
}

/** Eine Klappzeile lohnt erst ab zwei Zeilen, die sie verbirgt. */
const MIN_FOLDED = 2;
const OLDER_KEY = "aelter";
const monthsKey = (year: number) => `monate-${String(year)}`;

/**
 * „Alle Ziele“ (seit 2.38.0): je Jahr das Jahresziel, die Monatsziele
 * hinter einer Zeile, Jahre vor dem Vorjahr unter „Ältere Ziele“. Zuvor stand
 * jedes Ziel als eigene Zeile — mit zwölf Monatszielen war die Liste rechts
 * doppelt so lang wie die Diagramme daneben, die die Monate ohnehin zeigen.
 * Alles beginnt eingeklappt; was aufgeklappt ist, steht in der Adresse
 * (`offen`), damit der Weg zurück von einem Ziel es wiederfindet.
 */
function GoalList({
  list,
  courses,
}: {
  list: { recent: GoalYear[]; older: GoalYear[] };
  courses: Courses;
}) {
  const olderRows = list.older.reduce(
    (sum, entry) => sum + entry.annual.length + Math.min(entry.months.length, 1),
    0,
  );
  const foldOlder = olderRows >= MIN_FOLDED;
  const keys = [...list.recent, ...list.older]
    .filter((entry) => entry.months.length >= MIN_FOLDED)
    .map((entry) => monthsKey(entry.year));
  if (foldOlder) keys.push(OLDER_KEY);
  const { isOpen, toggle } = useOpenMonths(keys, null);

  const goalRow = (progress: GoalProgress) => (
    <li key={progress.goal.id}>
      <GoalRow progress={progress} course={courses.get(progress.goal.id) ?? null} />
    </li>
  );

  const yearRows = (entry: GoalYear) => {
    const rows = entry.annual.map(goalRow);
    if (entry.months.length < MIN_FOLDED) return [...rows, ...entry.months.map(goalRow)];
    const key = monthsKey(entry.year);
    const open = isOpen(key);
    rows.push(
      <li key={key}>
        <FoldRow
          count={entry.months.length}
          unit="Ziele"
          title="Monatsziele"
          label={`Monatsziele ${String(entry.year)}`}
          srCount={formatCountNoun(entry.months.length, "Ziel", "Ziele")}
          meta={resultSummary(entry.months)}
          open={open}
          onToggle={() => {
            toggle(key);
          }}
        />
      </li>,
    );
    return open ? [...rows, ...entry.months.map(goalRow)] : rows;
  };

  const olderOpen = !foldOlder || isOpen(OLDER_KEY);
  const first = list.older.at(-1)?.year;
  const last = list.older.at(0)?.year;
  return (
    <ListGroup>
      {list.recent.flatMap(yearRows)}
      {foldOlder && first !== undefined && last !== undefined && (
        <li key={OLDER_KEY}>
          <FoldRow
            count={list.older.length}
            unit={list.older.length === 1 ? "Jahr" : "Jahre"}
            title="Ältere Ziele"
            label="Ältere Ziele"
            srCount={formatCountNoun(list.older.length, "Jahr", "Jahre")}
            meta={`${first === last ? String(first) : `${String(first)}–${String(last)}`} · ${resultSummary(
              list.older.flatMap((entry) => [...entry.annual, ...entry.months]),
            )}`}
            open={olderOpen}
            onToggle={() => {
              toggle(OLDER_KEY);
            }}
          />
        </li>
      )}
      {olderOpen && list.older.flatMap(yearRows)}
    </ListGroup>
  );
}

/** „9 von 10 erreicht“ über die abgeschlossenen Ziele. */
function resultSummary(items: readonly GoalProgress[]): string {
  let hit = 0;
  let ended = 0;
  for (const { status } of items) {
    if (status === "reached" || status === "exceeded") hit += 1;
    if (status === "reached" || status === "exceeded" || status === "missed") ended += 1;
  }
  return ended > 0 ? `${String(hit)} von ${String(ended)} erreicht` : "noch offen";
}

/**
 * Klappzeile in der Form einer Zielzeile: Kachel mit der Anzahl, darunter die
 * Bilanz, rechts der Pfeil.
 */
function FoldRow({
  count,
  unit,
  title,
  label,
  srCount,
  meta,
  open,
  onToggle,
}: {
  count: number;
  unit: string;
  title: string;
  /** Vollständiger Name für Sprachausgaben. */
  label: string;
  /** Anzahl für Sprachausgaben, etwa „12 Ziele“. */
  srCount: string;
  meta: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <ListRow asChild>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        <ListItemBody
          leading={<ListTile primary={String(count)} secondary={unit} muted />}
          title={
            <>
              <span aria-hidden>{title}</span>
              <span className="sr-only">{`${label}, ${srCount}`}</span>
            </>
          }
          meta={meta}
        />
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
    </ListRow>
  );
}

function resultNote(
  progress: GoalProgress,
  course: GoalCourse | undefined,
): string | undefined {
  if (course) {
    return `${courseLabel(course.kind)}: Hochrechnung ${formatMoney(course.expected)}`;
  }
  switch (progress.status) {
    case "exceeded":
      return `Übertroffen um ${formatMoney(progress.overshoot)}`;
    case "missed":
      return `Verfehlt um ${formatMoney(progress.remaining)}`;
    case "active":
      return `Noch ${formatMoney(progress.remaining)} bis zum Ziel`;
    case "reached":
      return "Genau erreicht";
    default:
      return undefined;
  }
}

function toYearData(
  history: readonly GoalProgress[],
  forecast: Forecast,
  courses: Courses,
  today: RefDate,
): GoalBarDatum[] {
  return history.map((progress) => {
    const year = progress.goal.year;
    const rest =
      year === today.year ? forecast.forecast.subtract(forecast.received) : null;
    const restMoney = rest?.isPositive() ? rest : null;
    return {
      key: String(year),
      label: String(year),
      detail: String(year),
      actual: progress.actual.toChartNumber(),
      rest: restMoney ? restMoney.toChartNumber() : 0,
      target: progress.target.toChartNumber(),
      actualMoney: progress.actual,
      restMoney,
      targetMoney: progress.target,
      note: resultNote(progress, courses.get(progress.goal.id)),
    };
  });
}

function toMonthData(
  goals: readonly Goal[],
  payments: readonly AnalyticsPayment[],
  forecast: Forecast,
  courses: Courses,
  today: RefDate,
): GoalBarDatum[] {
  const buckets = monthlyBuckets(payments, today.year);
  return buckets.map((bucket, index) => {
    const goal = goals.find(
      (g) =>
        g.goalType === "monthly" && g.year === today.year && g.month === bucket.month,
    );
    // Ohne Monatsgrenze: Ein Eingang, der auf einen vergangenen Monat gebucht
    // ist, aber noch aussteht, gehoert dorthin — so ergeben die Balken genau
    // die Jahresprognose.
    const rest = forecast.restByMonth[index];
    const restMoney = rest.isPositive() ? rest : null;
    const progress = goal ? computeGoalProgress(goal, payments, today) : null;
    return {
      key: String(bucket.month),
      label: monthNameDeShort(bucket.month),
      detail: `${monthNameDe(bucket.month)} ${String(today.year)}`,
      actual: bucket.net.toChartNumber(),
      rest: restMoney ? restMoney.toChartNumber() : 0,
      target: goal ? goal.targetAmount.toChartNumber() : null,
      actualMoney: bucket.net,
      restMoney,
      targetMoney: goal ? goal.targetAmount : null,
      note: progress ? resultNote(progress, courses.get(progress.goal.id)) : undefined,
    };
  });
}
