import * as React from "react";
import { KpiHero } from "@/components/domain/KpiHero";
import { Section } from "@/components/ui/section";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented";
import {
  EUR,
  Money,
  MoneyDecimal,
  formatMoneyWhole,
  formatPercent,
  type DecimalInstance,
} from "@/lib/money";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import {
  SnowballChart,
  type SnowballDatum,
} from "@/features/statistics/components/charts";
import { ForecastGate } from "@/features/securities/ForecastGate";
import {
  AMOUNT_MAX,
  DEFAULT_FORECAST_SETTINGS,
  PERCENT_MAX,
  useForecastSettings,
  useSaveForecastSettings,
  type ForecastSettings,
} from "@/features/securities/forecastSettings";
import {
  projectSnowball,
  snowballChartEndYear,
  snowballHistory,
  type DepotAssumptions,
  type SnowballHistoryPoint,
  type SnowballResult,
  type SnowballSettings,
} from "@/features/securities/snowball";
import { NumberField, SettingsList } from "./fields";
import { formatDecimal } from "./format";
import { useSavingsPlans } from "./savingsPlanHooks";
import { activeMonthlyTotal } from "./savingsPlans";
import { withPlanSavings } from "./targetTime";

/**
 * Planer › **Schneeball**: ab wann tragen mich Dividenden? Zog mit 2.20.0 aus
 * Bestand › Prognose hierher — er rechnet durch, was waere, wenn du sparst,
 * und gehoert damit zum Planer statt zum Bestand (CALCULATION_RULES.md §14.2).
 * Gespeichert sind nur die Annahmen. Ohne eigene Sparrate gilt die Summe der
 * gepflegten Sparpläne (seit 2.21.0, §17). Seit 2.32.0 zeigt er links von
 * heute auch den bisherigen Weg aus den erhaltenen Dividenden.
 */
export function SnowballTab() {
  const settingsQuery = useForecastSettings();
  const { data: plans = [] } = useSavingsPlans();
  const planSavings = Math.round(activeMonthlyTotal(plans).toNumber());
  return (
    <ForecastGate emptyDescription="Der Schneeball rechnet hoch, ab wann deine Dividenden dein Ziel tragen. Dafür braucht er einen Depotstand aus dem DivvyDiary-Portfolio-Export.">
      {({ forecast, depot, payments, startYear, startMonth }) => (
        <SnowballSection
          depot={depot}
          history={snowballHistory(payments, startYear)}
          netRatio={forecast.netRatio}
          settings={settingsQuery.data ?? DEFAULT_FORECAST_SETTINGS}
          planSavings={planSavings}
          startYear={startYear}
          startMonth={startMonth}
        />
      )}
    </ForecastGate>
  );
}

function SnowballSection({
  depot,
  history,
  netRatio,
  settings: stored,
  planSavings,
  startYear,
  startMonth,
}: {
  depot: DepotAssumptions;
  history: readonly SnowballHistoryPoint[];
  netRatio: DecimalInstance | null;
  settings: ForecastSettings;
  /** Summe der aktiven Sparpläne im Monat, gerundet; 0 ohne Pläne. */
  planSavings: number;
  startYear: number;
  startMonth: number;
}) {
  const { mutate: save } = useSaveForecastSettings();
  const update = React.useCallback(
    (patch: Partial<SnowballSettings>) => {
      save({ ...stored, ...patch });
    },
    [save, stored],
  );
  // Die Sparpläne kommen zu den Einmalkäufen hinzu (seit 2.33.0).
  const settings = React.useMemo(
    () => withPlanSavings(stored, planSavings),
    [stored, planSavings],
  );

  const result = React.useMemo(
    () => projectSnowball({ depot, settings, netRatio, startYear, startMonth }),
    [depot, settings, netRatio, startYear, startMonth],
  );
  const endYear = snowballChartEndYear(result, startYear);
  const firstYear = history[0]?.year ?? startYear;
  const ranges = RANGES.filter(
    (option) => option.value === "max" || RANGE_YEARS[option.value] < endYear - firstYear,
  );
  // Standard „10 J." (seit 2.37.2, Lutz: Zukunftsblick); ohne diese Stufe Max.
  const [range, setRange] = React.useState<SnowballRange>("10");
  const shown = ranges.some((option) => option.value === range) ? range : "max";
  const fromYear = chartStartYear(shown, firstYear, startYear, endYear);
  const chartData = React.useMemo(
    () => toSnowballData(history, result, fromYear, endYear),
    [history, result, fromYear, endYear],
  );
  const real = settings.inflationPercent > 0;

  return (
    <div className="space-y-6">
      <SnowballHeadline result={result} settings={settings} start={history[0]} />

      <SettingsList label="Annahmen" className="grid-cols-3 md:grid-cols-6">
        <NumberField
          id="snowball-savings"
          max={AMOUNT_MAX}
          label="Einmalkäufe"
          fullLabel="Einmalkäufe pro Monat, zusätzlich zu den Sparplänen"
          suffix="€"
          value={stored.monthlySavings}
          onCommit={(value) => {
            update({ monthlySavings: value ?? 0 });
          }}
        />
        <NumberField
          id="snowball-target"
          max={AMOUNT_MAX}
          label="Ziel"
          fullLabel="Ziel pro Monat"
          suffix="€"
          value={settings.targetMonthly}
          onCommit={(value) => {
            update({ targetMonthly: value ?? 0 });
          }}
        />
        <NumberField
          id="snowball-growth"
          max={PERCENT_MAX}
          label="CAGR"
          fullLabel="Dividenden-CAGR"
          suffix="%"
          value={settings.growthPercent}
          placeholder={formatDecimal(depot.growthPercent)}
          onCommit={(value) => {
            update({ growthPercent: value });
          }}
        />
        <NumberField
          id="snowball-yield"
          max={PERCENT_MAX}
          label="Rendite"
          fullLabel="Rendite neuer Käufe"
          suffix="%"
          value={settings.yieldPercent}
          placeholder={formatDecimal(depot.yieldPercent)}
          onCommit={(value) => {
            update({ yieldPercent: value });
          }}
        />
        <NumberField
          id="snowball-inflation"
          max={PERCENT_MAX}
          label="Inflation"
          fullLabel="Inflation pro Jahr"
          suffix="%"
          value={settings.inflationPercent}
          onCommit={(value) => {
            update({ inflationPercent: value ?? 0 });
          }}
        />
        {/* Wie CAGR und Rendite: leer = aus dem Depot, hier der Anteil der
            Dividende aus Assets mit automatischer Reinvestition (seit 2.38.0). */}
        <NumberField
          id="snowball-reinvest"
          max={100}
          label="Reinvestiert"
          fullLabel="Reinvestierter Anteil der Dividenden"
          suffix="%"
          value={settings.reinvestPercent}
          placeholder={formatDecimal(depot.reinvestShare.times(100).toDecimalPlaces(0))}
          onCommit={(value) => {
            update({ reinvestPercent: value });
          }}
        />
      </SettingsList>

      {planSavings > 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          Dazu {formatEuro(planSavings)} Sparpläne im Monat, zusammen{" "}
          <span className="font-medium text-foreground">
            {formatEuro(settings.monthlySavings)}
          </span>
          .
        </p>
      )}

      <Section
        title="Verlauf"
        {...(ranges.length > 1 && {
          action: (
            <SegmentedControl
              label="Zeitraum"
              options={ranges}
              value={shown}
              onChange={setRange}
              variant="pill"
            />
          ),
        })}
      >
        <SnowballChart
          data={chartData}
          target={settings.targetMonthly > 0 ? settings.targetMonthly : null}
          ariaLabel={`Nettodividende pro Monat${fromYear < startYear ? ` seit ${String(fromYear)}` : ""}, hochgerechnet bis ${String(endYear)}${real ? " in heutiger Kaufkraft" : ""}`}
        />
      </Section>

      <Milestones result={result} />
    </div>
  );
}

/**
 * Kopf des Schneeballs im selben `KpiHero` wie der Seitenkopf: das Zieljahr
 * als Hauptzahl, rechts (auf dem Telefon darunter) der heutige Monatswert und
 * die Zieljahre der beiden Szenarien. Unter „Heute" steht seit 2.32.0, wo der
 * Weg begann — das erste Jahr mit Dividenden.
 */
function SnowballHeadline({
  result,
  settings,
  start,
}: {
  result: SnowballResult;
  settings: SnowballSettings;
  start: SnowballHistoryPoint | undefined;
}) {
  if (settings.targetMonthly <= 0) return null;
  const target = formatMoneyWhole(
    Money.fromDecimal(new MoneyDecimal(settings.targetMonthly), EUR),
  );
  const { targetYear, targetYearEarliest, targetYearLatest } = result;
  const first = result.points[0];
  const last = result.points[result.points.length - 1].year;
  const yearText = (year: number | null) =>
    year === null ? `nach ${String(last)}` : String(year);

  return (
    <KpiHero
      label={`Ziel ${target} im Monat`}
      value={yearText(targetYear)}
      caption={
        targetYear === null
          ? "Mit diesen Annahmen nicht innerhalb von 30 Jahren erreicht."
          : result.today.greaterThanOrEqualTo(settings.targetMonthly)
            ? "Schon erreicht."
            : targetYear === first.year
              ? "noch in diesem Jahr"
              : `in ${formatCountNoun(targetYear - first.year, "Jahr", "Jahren")}`
      }
      stats={[
        {
          label: "Heute",
          value: formatMoneyWhole(Money.fromDecimal(result.today, EUR)),
          caption: start
            ? `${String(start.year)}: ${formatMoneyWhole(Money.fromDecimal(start.monthly, EUR))}`
            : "netto im Monat",
        },
        {
          label: "Optimistisch",
          value: yearText(targetYearEarliest),
          caption: `${formatPercent(result.growthHighPercent)} CAGR`,
        },
        {
          label: "Vorsichtig",
          value: yearText(targetYearLatest),
          caption: `${formatPercent(result.growthLowPercent)} CAGR`,
        },
      ]}
    />
  );
}

function Milestones({ result }: { result: SnowballResult }) {
  if (result.milestones.length === 0) return null;
  return (
    <ul
      className="text-sm"
      aria-label="Meilensteine"
    >
      {result.milestones.map((milestone) => (
        <li
          key={`${String(milestone.amount)}-${String(milestone.isTarget)}`}
          className="flex min-h-11 items-center justify-between gap-3 py-2"
        >
          <span className={milestone.isTarget ? "font-semibold" : undefined}>
            {formatMoneyWhole(Money.fromDecimal(new MoneyDecimal(milestone.amount), EUR))}{" "}
            im Monat{milestone.isTarget && " · Ziel"}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {milestone.year === null
              ? "nicht absehbar"
              : result.today.greaterThanOrEqualTo(milestone.amount)
                ? "erreicht"
                : String(milestone.year)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatEuro(value: number): string {
  return formatMoneyWhole(Money.fromDecimal(new MoneyDecimal(value), EUR));
}

type SnowballRange = "max" | "20" | "10";

/** Zeitraum des Diagramms (seit 2.36.0), wie die übrigen Umschalter als Pille. */
const RANGES: readonly SegmentOption<SnowballRange>[] = [
  { value: "max", label: "Max" },
  { value: "20", label: "20 J." },
  { value: "10", label: "10 J." },
];
const RANGE_YEARS: Record<SnowballRange, number> = { max: Infinity, "20": 20, "10": 10 };

/**
 * Erstes Jahr im Diagramm: „Max" zeigt den ganzen Weg, 20 und 10 Jahre zuerst
 * die Hochrechnung bis zum Ende des Diagramms und füllen den Rest mit dem
 * bisherigen Weg. So rückt der Weg zum Ziel ins Bild, statt dass lange Jahre
 * mit kleinen Beträgen die halbe Breite füllen.
 */
function chartStartYear(
  range: SnowballRange,
  firstYear: number,
  startYear: number,
  endYear: number,
): number {
  if (range === "max") return firstYear;
  const span = RANGE_YEARS[range];
  const ahead = Math.min(endYear - startYear, span);
  return Math.max(firstYear, startYear - (span - ahead));
}

/**
 * Bisheriger Weg und Hochrechnung in einer Reihe: Vergangene Jahre tragen nur
 * `actual`, die Hochrechnung nur `base`/`band`. Heute trägt beides, damit die
 * Linie des Wegs in die Hochrechnung übergeht.
 */
function toSnowballData(
  history: readonly SnowballHistoryPoint[],
  result: SnowballResult,
  fromYear: number,
  endYear: number,
): SnowballDatum[] {
  const visible = history.filter((point) => point.year >= fromYear);
  const past: SnowballDatum[] = visible.map((point) => ({
    year: point.year,
    label: String(point.year),
    actual: point.monthly.toNumber(),
    actualMoney: Money.fromDecimal(point.monthly, EUR),
    base: null,
    band: null,
    projection: null,
  }));
  const shown = result.points.filter((point) => point.year <= endYear);
  const future: SnowballDatum[] = shown.map((point, index) => ({
    year: point.year,
    label: String(point.year),
    actual: index === 0 && visible.length > 0 ? point.base.toNumber() : null,
    actualMoney: null,
    base: point.base.toNumber(),
    band: [point.low.toNumber(), point.high.toNumber()],
    projection: {
      base: Money.fromDecimal(point.base, EUR),
      low: Money.fromDecimal(point.low, EUR),
      high: Money.fromDecimal(point.high, EUR),
    },
  }));
  return [...past, ...future];
}
