/**
 * Dividenden-Schneeball: Hochrechnung der monatlichen Nettodividende ueber die
 * Jahre (Bestand › Prognose, CALCULATION_RULES.md §14).
 *
 * Reine Funktionen. Die Rechnung kennt nur Dividenden und Sparrate —
 * Kursgewinne fliessen bewusst nicht ein: Gefragt ist „ab wann tragen mich
 * Dividenden", nicht „was ist mein Depot wert". Gespeichert werden allein die
 * Annahmen, nie ein Ergebnis (PRODUCT_SPEC.md Grundsatz 8).
 *
 * Gerechnet wird in Monatsschritten mit Decimal:
 *
 * 1. Monatliche Nettodividende = Jahresdividende (brutto) × Netto-Quote ÷ 12.
 * 2. Investiert wird die Sparrate, bei Reinvestition zuzueglich dieser
 *    Nettodividende. Jeder investierte Euro erhoeht die Jahresdividende um die
 *    angenommene Rendite neuer Kaeufe.
 * 3. Am Ende jedes Jahres waechst die gesamte Jahresdividende um das
 *    angenommene Dividendenwachstum.
 * 4. Mit Inflation steht jeder Wert in heutiger Kaufkraft: geteilt durch
 *    (1 + Inflation)^Jahre.
 */
import { MoneyDecimal, type DecimalInstance } from "@/lib/money";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import { latestAsOf, snapshotsAt } from "./snapshots";

const SNOWBALL_YEARS = 30;

/** Abstand der Szenarien zum angenommenen Wachstum, in Prozentpunkten. */
const SCENARIO_SPREAD = 2;

/** Gespeicherte Annahmen (profiles.forecast_settings). */
export interface SnowballSettings {
  /** Sparrate pro Monat in Euro. */
  monthlySavings: number;
  reinvest: boolean;
  /** Dividendenwachstum p. a. in Prozent; `null` = aus dem Depot. */
  growthPercent: number | null;
  /** Dividendenrendite neuer Kaeufe in Prozent; `null` = aus dem Depot. */
  yieldPercent: number | null;
  /** Ziel: Nettodividende pro Monat in Euro. */
  targetMonthly: number;
  /** Inflation p. a. in Prozent; 0 = Nennwerte. */
  inflationPercent: number;
}

export const DEFAULT_SNOWBALL_SETTINGS: SnowballSettings = {
  monthlySavings: 0,
  reinvest: true,
  growthPercent: null,
  yieldPercent: null,
  targetMonthly: 1000,
  inflationPercent: 2,
};

/** Grenzen der Vorbelegung aus dem Depot: kein Ausreisser bestimmt 30 Jahre. */
const GROWTH_FALLBACK = 5;
const GROWTH_MAX = 8;
const YIELD_FALLBACK = 3;
const YIELD_MIN = 0.5;
const YIELD_MAX = 10;

const HUNDRED = new MoneyDecimal(100);
const TWELVE = new MoneyDecimal(12);
const ONE = new MoneyDecimal(1);

export interface DepotAssumptions {
  /** Erwartete Jahresdividende (brutto) des juengsten Stands. */
  annualGross: DecimalInstance;
  /** Mit der Jahresdividende gewichtete Dividenden-CAGR, gedeckelt (Prozent). */
  growthPercent: DecimalInstance;
  /** Jahresdividende ÷ Depotwert, gedeckelt (Prozent). */
  yieldPercent: DecimalInstance;
}

function clamp(value: DecimalInstance, min: number, max: number): DecimalInstance {
  return MoneyDecimal.max(MoneyDecimal.min(value, max), min);
}

/**
 * Vorbelegungen aus dem juengsten Depotstand.
 *
 * Das Wachstum ist mit der erwarteten Jahresdividende gewichtet: Eine kleine
 * Position mit 30 % CAGR soll nicht die Erwartung des ganzen Depots tragen.
 * Positionen ohne CAGR zaehlen nicht mit.
 */
export function depotAssumptions(
  snapshots: readonly SecuritySnapshot[],
): DepotAssumptions | null {
  const rows = snapshotsAt(snapshots, latestAsOf(snapshots));
  if (rows.length === 0) return null;

  let annual = new MoneyDecimal(0);
  let market = new MoneyDecimal(0);
  let weighted = new MoneyDecimal(0);
  let weight = new MoneyDecimal(0);
  for (const row of rows) {
    const dividend =
      row.annual_dividend_total === null
        ? null
        : new MoneyDecimal(row.annual_dividend_total);
    if (dividend) annual = annual.plus(dividend);
    if (row.market_value !== null) market = market.plus(row.market_value);
    if (dividend?.greaterThan(0) && row.dividend_cagr !== null) {
      weighted = weighted.plus(new MoneyDecimal(row.dividend_cagr).times(dividend));
      weight = weight.plus(dividend);
    }
  }

  const growth = weight.greaterThan(0)
    ? clamp(weighted.dividedBy(weight).times(HUNDRED), 0, GROWTH_MAX)
    : new MoneyDecimal(GROWTH_FALLBACK);
  const yieldPercent = market.greaterThan(0)
    ? clamp(annual.dividedBy(market).times(HUNDRED), YIELD_MIN, YIELD_MAX)
    : new MoneyDecimal(YIELD_FALLBACK);

  return { annualGross: annual, growthPercent: growth, yieldPercent };
}

export interface SnowballPoint {
  /** Kalenderjahr; der erste Punkt ist heute. */
  year: number;
  /** Nettodividende pro Monat (heutige Kaufkraft bei Inflation > 0). */
  base: DecimalInstance;
  low: DecimalInstance;
  high: DecimalInstance;
}

export interface SnowballMilestone {
  /** Nettodividende pro Monat. */
  amount: number;
  /** Jahr, in dem sie erreicht ist; `null` = nicht innerhalb des Horizonts. */
  year: number | null;
  isTarget: boolean;
}

export interface SnowballResult {
  points: SnowballPoint[];
  /** Ziel erreicht im Basisszenario; `null` = nicht innerhalb des Horizonts. */
  targetYear: number | null;
  /** Spanne der Szenarien: optimistisch frueh, vorsichtig spaet. */
  targetYearEarliest: number | null;
  targetYearLatest: number | null;
  milestones: SnowballMilestone[];
  /** Annahmen, mit denen gerechnet wurde (Prozent). */
  growthPercent: DecimalInstance;
  /** Wachstum der Szenarien optimistisch und vorsichtig (Prozent). */
  growthHighPercent: DecimalInstance;
  growthLowPercent: DecimalInstance;
  yieldPercent: DecimalInstance;
}

const MILESTONES = [100, 250, 500, 1000, 1500, 2000, 3000, 5000, 7500, 10000] as const;
const MAX_MILESTONES = 4;

/** Ein Szenario: monatliche Nettodividende am Ende jedes Jahres, Jahr 0 = heute. */
function simulate({
  annualGross,
  ratio,
  savings,
  reinvest,
  growth,
  yieldRate,
  years,
}: {
  annualGross: DecimalInstance;
  ratio: DecimalInstance;
  savings: DecimalInstance;
  reinvest: boolean;
  growth: DecimalInstance;
  yieldRate: DecimalInstance;
  years: number;
}): DecimalInstance[] {
  const growthFactor = ONE.plus(growth.dividedBy(HUNDRED));
  const yieldShare = yieldRate.dividedBy(HUNDRED);
  const monthlyNet = (annual: DecimalInstance) => annual.times(ratio).dividedBy(TWELVE);

  let annual = annualGross;
  const series = [monthlyNet(annual)];
  for (let year = 1; year <= years; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const invested = reinvest ? savings.plus(monthlyNet(annual)) : savings;
      annual = annual.plus(invested.times(yieldShare));
    }
    annual = annual.times(growthFactor);
    series.push(monthlyNet(annual));
  }
  return series;
}

function firstYearReaching(
  series: readonly DecimalInstance[],
  target: DecimalInstance,
  startYear: number,
): number | null {
  const index = series.findIndex((value) => value.greaterThanOrEqualTo(target));
  return index === -1 ? null : startYear + index;
}

/**
 * Rechnet drei Szenarien: Basis mit dem angenommenen Wachstum, vorsichtig und
 * optimistisch {@link SCENARIO_SPREAD} Prozentpunkte darunter bzw. darueber
 * (nie unter 0 %).
 */
export function projectSnowball({
  depot,
  settings,
  netRatio,
  startYear,
  years = SNOWBALL_YEARS,
}: {
  depot: DepotAssumptions;
  settings: SnowballSettings;
  /** Netto-Quote (0–1); `null` rechnet brutto. */
  netRatio: DecimalInstance | null;
  startYear: number;
  years?: number;
}): SnowballResult {
  const growth =
    settings.growthPercent === null
      ? depot.growthPercent
      : new MoneyDecimal(settings.growthPercent);
  const yieldRate =
    settings.yieldPercent === null
      ? depot.yieldPercent
      : new MoneyDecimal(settings.yieldPercent);
  const common = {
    annualGross: depot.annualGross,
    ratio: netRatio ?? ONE,
    savings: new MoneyDecimal(Math.max(settings.monthlySavings, 0)),
    reinvest: settings.reinvest,
    yieldRate,
    years,
  };

  const inflation = ONE.plus(
    new MoneyDecimal(Math.max(settings.inflationPercent, 0)).dividedBy(HUNDRED),
  );
  const real = (series: DecimalInstance[]) =>
    series.map((value, year) => value.dividedBy(inflation.pow(year)));

  const growthLow = MoneyDecimal.max(growth.minus(SCENARIO_SPREAD), 0);
  const growthHigh = growth.plus(SCENARIO_SPREAD);
  const base = real(simulate({ ...common, growth }));
  const low = real(simulate({ ...common, growth: growthLow }));
  const high = real(simulate({ ...common, growth: growthHigh }));

  const points = base.map((value, index) => ({
    year: startYear + index,
    base: value,
    low: low[index],
    high: high[index],
  }));

  const target = new MoneyDecimal(Math.max(settings.targetMonthly, 0));
  const now = base[0];
  const milestones: SnowballMilestone[] = MILESTONES.filter(
    (amount) => now.lessThan(amount) && target.greaterThan(amount),
  )
    .slice(-(MAX_MILESTONES - 1))
    .map((amount) => ({
      amount,
      year: firstYearReaching(base, new MoneyDecimal(amount), startYear),
      isTarget: false,
    }));
  if (target.greaterThan(0)) {
    milestones.push({
      amount: settings.targetMonthly,
      year: firstYearReaching(base, target, startYear),
      isTarget: true,
    });
  }

  return {
    points,
    targetYear: target.greaterThan(0) ? firstYearReaching(base, target, startYear) : null,
    targetYearEarliest: target.greaterThan(0)
      ? firstYearReaching(high, target, startYear)
      : null,
    targetYearLatest: target.greaterThan(0)
      ? firstYearReaching(low, target, startYear)
      : null,
    milestones,
    growthPercent: growth,
    growthHighPercent: growthHigh,
    growthLowPercent: growthLow,
    yieldPercent: yieldRate,
  };
}
