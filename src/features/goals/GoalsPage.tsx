import * as React from "react";
import { Link } from "react-router";
import { CalendarRange, ChevronDown, Plus, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Section, SectionButton } from "@/components/ui/section";
import { ListGroup, ListItemBody, ListRow, ListTile } from "@/components/ui/list";
import { CollapsibleMonth, MonthSections } from "@/components/ui/month-section";
import { KpiHero, KpiHeroSkeleton, type KpiStat } from "@/components/domain/KpiHero";
import { PageHeader } from "@/components/layout/PageHeader";
import { DeriveMonthlyGoalsDialog } from "./DeriveMonthlyGoalsDialog";
import { GapPurchaseBox } from "./GapPurchaseBox";
import { GoalBarChart, type GoalBarDatum } from "@/features/statistics/components/charts";
import { useForecastSettings } from "@/features/securities/forecastSettings";
import { useBackState, type BackState } from "@/lib/hooks/useBackState";
import { useOpenKeys } from "@/lib/hooks/useOpenKeys";
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
      list: groupForList(progress),
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
  backState,
}: {
  progress: GoalProgress;
  course: GoalCourse | null;
  backState: BackState;
}) {
  const { goal, status } = progress;
  const isMonthly = goal.goalType === "monthly" && goal.month !== null;
  const upcoming = status === "upcoming";
  return (
    <ListRow asChild>
      <Link to={`/ziele/${goal.id}`} state={backState}>
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

interface GoalLists {
  /** Jahresziele, neuestes zuerst. */
  annual: GoalProgress[];
  /** Monatsziele je Jahr, neuestes Jahr und neuester Monat zuerst. */
  months: { year: number; items: GoalProgress[] }[];
}

function groupForList(items: readonly GoalProgress[]): GoalLists {
  const annual = items
    .filter((item) => item.goal.goalType === "annual")
    .toSorted((a, b) => b.goal.year - a.goal.year);
  const byYear = new Map<number, GoalProgress[]>();
  for (const item of items) {
    if (item.goal.goalType === "annual") continue;
    const list = byYear.get(item.goal.year);
    if (list) list.push(item);
    else byYear.set(item.goal.year, [item]);
  }
  return {
    annual,
    months: [...byYear]
      .toSorted(([a], [b]) => b - a)
      .map(([year, list]) => ({
        year,
        items: list.toSorted((a, b) => (b.goal.month ?? 0) - (a.goal.month ?? 0)),
      })),
  };
}

/** Ziele je Bereich vor „Weitere anzeigen“. */
const VISIBLE = 5;
const YEARS_KEY = "jahre";
const monthsKey = (year: number) => `monate-${String(year)}`;

/**
 * „Alle Ziele“ (seit 2.41.0) in Bereichen wie Fortschritt › Erreicht: oben
 * die Jahresziele, darunter die Monatsziele je Jahr. Offen sind die
 * Jahresziele und das neueste Jahr der Monatsziele; ältere Monatsjahre sind
 * eingeklappt. In einem Bereich stehen die fünf neuesten Ziele, der Rest
 * hinter „Weitere anzeigen“.
 * Zuvor stand jedes Ziel als eigene Zeile — mit zwölf Monatszielen war die
 * Liste doppelt so lang wie die Diagramme daneben, die die Monate ohnehin
 * zeigen.
 *
 * Was vom Anfangszustand abweicht, steht in der Adresse (`zu` für
 * eingeklappte, `offen` für aufgeklappte Bereiche, `alle` für ganz gezeigte),
 * damit der Weg zurück von einem Ziel es wiederfindet.
 */
function GoalList({ list, courses }: { list: GoalLists; courses: Courses }) {
  const opened = useOpenKeys("offen");
  const closed = useOpenKeys("zu");
  const expanded = useOpenKeys("alle");
  const backState = useBackState();

  const goalRow = (progress: GoalProgress) => (
    <li key={progress.goal.id}>
      <GoalRow
        progress={progress}
        course={courses.get(progress.goal.id) ?? null}
        backState={backState}
      />
    </li>
  );

  const section = (
    key: string,
    title: string,
    items: readonly GoalProgress[],
    visible: number,
    startsOpen: boolean,
  ) => {
    const open = startsOpen ? !closed.isOpen(key) : opened.isOpen(key);
    // „1 weitere“ spart keine Zeile: dann gleich alle.
    const limited = items.length > visible + 1;
    const all = !limited || expanded.isOpen(key);
    return (
      <CollapsibleMonth
        key={key}
        id={`ziele-${key}`}
        title={title}
        aside={resultSummary(items)}
        open={open}
        onToggle={() => {
          (startsOpen ? closed : opened).toggle(key);
        }}
      >
        <ListGroup>
          {(all ? items : items.slice(0, visible)).map(goalRow)}
          {limited && (
            <li>
              <MoreRow
                more={items.length - visible}
                all={all}
                onToggle={() => {
                  expanded.toggle(key);
                }}
              />
            </li>
          )}
        </ListGroup>
      </CollapsibleMonth>
    );
  };

  return (
    <MonthSections lineAfterOpen={false}>
      {list.annual.length > 0 &&
        section(YEARS_KEY, "Jahresziele", list.annual, VISIBLE, true)}
      {list.months.map(({ year, items }, index) =>
        section(
          monthsKey(year),
          `Monatsziele ${String(year)}`,
          items,
          VISIBLE,
          index === 0,
        ),
      )}
    </MonthSections>
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
 * Letzte Zeile eines Bereichs: zeigt die übrigen Ziele oder blendet sie wieder
 * aus. Der Text steht auf der Linie der Zieltitel, unter den Kacheln.
 */
function MoreRow({
  more,
  all,
  onToggle,
}: {
  more: number;
  all: boolean;
  onToggle: () => void;
}) {
  return (
    <ListRow asChild>
      <button type="button" aria-expanded={all} onClick={onToggle}>
        <span aria-hidden className="w-11 shrink-0" />
        <span className="min-w-0 flex-1 text-sm font-medium text-muted-foreground">
          {all ? "Weniger anzeigen" : `${String(more)} weitere anzeigen`}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            all && "rotate-180",
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
