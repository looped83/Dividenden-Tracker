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
 * 2. Investiert wird die Sparrate zuzueglich des reinvestierten Anteils dieser
 *    Nettodividende (seit 2.38.0 standardmaessig laut Assets, siehe
 *    {@link reinvestShare}). Jeder investierte Euro erhoeht die
 *    Jahresdividende um die angenommene Rendite neuer Kaeufe.
 * 3. Am Ende jedes Jahres waechst die gesamte Jahresdividende um das
 *    angenommene Dividendenwachstum.
 * 4. Mit Inflation steht jeder Wert in heutiger Kaufkraft: geteilt durch
 *    (1 + Inflation)^Jahre.
 */
import { MoneyDecimal, type DecimalInstance } from "@/lib/money";
import { yearlyBuckets, type AnalyticsPayment } from "@/lib/statistics";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import { latestAsOf, snapshotsAt } from "./snapshots";

const SNOWBALL_YEARS = 30;

/** Abstand der Szenarien zum angenommenen Wachstum, in Prozentpunkten. */
const SCENARIO_SPREAD = 2;

/**
 * Was von den Dividenden reinvestiert wird: so viel, wie die Assets mit
 * automatischer Reinvestition bringen (`assets`), alles oder nichts.
 */
export type ReinvestMode = "assets" | "all" | "none";

/** Gespeicherte Annahmen (profiles.forecast_settings). */
export interface SnowballSettings {
  /** Sparrate pro Monat in Euro. */
  monthlySavings: number;
  reinvest: ReinvestMode;
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
  reinvest: "assets",
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
  /**
   * Anteil (0–1) der erwarteten Jahresdividende aus Assets, deren Dividenden
   * der Broker automatisch reinvestiert (`securities.reinvest_dividends`).
   */
  reinvestShare: DecimalInstance;
}

/** Kennungen der Assets, deren Dividenden automatisch reinvestiert werden. */
export function reinvestedIds(
  securities: readonly { id: string; reinvest_dividends: boolean }[],
): Set<string> {
  return new Set(securities.filter((s) => s.reinvest_dividends).map((s) => s.id));
}

/** Reinvestierter Anteil (0–1) der Nettodividende fuer die Rechnung. */
export function reinvestShare(
  settings: Pick<SnowballSettings, "reinvest">,
  depot: Pick<DepotAssumptions, "reinvestShare">,
): DecimalInstance {
  if (settings.reinvest === "all") return ONE;
  if (settings.reinvest === "none") return new MoneyDecimal(0);
  return depot.reinvestShare;
}

function clamp(value: DecimalInstance, min: number, max: number): DecimalInstance {
  return MoneyDecimal.max(MoneyDecimal.min(value, max), min);
}

/**
 * Vorbelegungen aus dem juengsten Depotstand.
 *
 * Das Wachstum ist mit der erwarteten Jahresdividende gewichtet: Eine kleine
 * Position mit 30 % CAGR soll nicht die Erwartung des ganzen Depots tragen.
 * Positionen ohne CAGR zaehlen nicht mit. Der reinvestierte Anteil ist
 * ebenso mit der Jahresdividende gewichtet: Er sagt, welcher Teil der
 * Ausschuettungen heute automatisch nachkauft.
 */
export function depotAssumptions(
  snapshots: readonly SecuritySnapshot[],
  reinvested: ReadonlySet<string> = new Set(),
): DepotAssumptions | null {
  const rows = snapshotsAt(snapshots, latestAsOf(snapshots));
  if (rows.length === 0) return null;

  let annual = new MoneyDecimal(0);
  let market = new MoneyDecimal(0);
  let weighted = new MoneyDecimal(0);
  let weight = new MoneyDecimal(0);
  let reinvestedAnnual = new MoneyDecimal(0);
  for (const row of rows) {
    const dividend =
      row.annual_dividend_total === null
        ? null
        : new MoneyDecimal(row.annual_dividend_total);
    if (dividend) annual = annual.plus(dividend);
    if (dividend && reinvested.has(row.security_id)) {
      reinvestedAnnual = reinvestedAnnual.plus(dividend);
    }
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

  const share = annual.greaterThan(0)
    ? reinvestedAnnual.dividedBy(annual)
    : new MoneyDecimal(0);

  return {
    annualGross: annual,
    growthPercent: growth,
    yieldPercent,
    reinvestShare: share,
  };
}

export interface SnowballPoint {
  /** Kalenderjahr; der Punkt steht am Jahresende (Dezember). */
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
  /** Nettodividende pro Monat heute. */
  today: DecimalInstance;
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

/**
 * Ein Szenario Monat für Monat: Index 0 ist heute, Index m der Stand nach m
 * Monaten, in heutiger Kaufkraft. Das Wachstum greift alle zwölf Monate ab
 * heute, die Inflation je Monat mit `(1 + Inflation)^(1/12)` — an jedem
 * Jahrestag genau `(1 + Inflation)^n` wie bis 2.35.
 */
function simulate({
  annualGross,
  ratio,
  savings,
  reinvest,
  growth,
  yieldRate,
  inflation,
  months,
}: {
  annualGross: DecimalInstance;
  ratio: DecimalInstance;
  savings: DecimalInstance;
  /** Reinvestierter Anteil der Nettodividende (0–1). */
  reinvest: DecimalInstance;
  growth: DecimalInstance;
  yieldRate: DecimalInstance;
  /** `1 + Inflation p. a.` */
  inflation: DecimalInstance;
  months: number;
}): DecimalInstance[] {
  const growthFactor = ONE.plus(growth.dividedBy(HUNDRED));
  const yieldShare = yieldRate.dividedBy(HUNDRED);
  const monthlyInflation = inflation.pow(ONE.dividedBy(TWELVE));
  const monthlyNet = (annual: DecimalInstance) => annual.times(ratio).dividedBy(TWELVE);

  let annual = annualGross;
  let deflator = ONE;
  const series = [monthlyNet(annual)];
  for (let month = 1; month <= months; month += 1) {
    const invested = savings.plus(monthlyNet(annual).times(reinvest));
    annual = annual.plus(invested.times(yieldShare));
    if (month % 12 === 0) {
      annual = annual.times(growthFactor);
      deflator = inflation.pow(month / 12);
    } else {
      deflator = deflator.times(monthlyInflation);
    }
    series.push(monthlyNet(annual).dividedBy(deflator));
  }
  return series;
}

/**
 * Kalenderjahr, in dem die Monatsreihe das Ziel zuerst erreicht (seit
 * 2.36.0 monatsgenau). Bis 2.35 zählte der erste Jahrestag ab heute, der
 * darüber lag: Im Oktober gerechnet, rutschte ein Ziel aus dem Dezember so
 * ins Folgejahr — das optimistische Szenario landete oft im Jahr der Basis.
 */
function firstYearReaching(
  series: readonly DecimalInstance[],
  target: DecimalInstance,
  startYear: number,
  startMonth: number,
): number | null {
  const index = series.findIndex((value) => value.greaterThanOrEqualTo(target));
  return index === -1 ? null : startYear + Math.floor((startMonth - 1 + index) / 12);
}

/**
 * Rechnet drei Szenarien: Basis mit dem angenommenen Wachstum, vorsichtig und
 * optimistisch {@link SCENARIO_SPREAD} Prozentpunkte darunter bzw. darueber
 * (nie unter 0 %). Die Punkte stehen seit 2.36.0 je Jahresende (Dezember),
 * damit Diagramm, Datentabelle und Zieljahre dasselbe Jahr meinen: Ein Ziel
 * im Jahr J heißt, der Punkt J liegt darüber, der Punkt J − 1 darunter.
 */
export function projectSnowball({
  depot,
  settings,
  netRatio,
  startYear,
  startMonth = 12,
  years = SNOWBALL_YEARS,
}: {
  depot: DepotAssumptions;
  settings: SnowballSettings;
  /** Netto-Quote (0–1); `null` rechnet brutto. */
  netRatio: DecimalInstance | null;
  startYear: number;
  /** Kalendermonat von heute (1–12). */
  startMonth?: number;
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
  // Monate bis zum letzten Dezember des Horizonts.
  const toDecember = 12 - startMonth;
  const common = {
    annualGross: depot.annualGross,
    ratio: netRatio ?? ONE,
    savings: new MoneyDecimal(Math.max(settings.monthlySavings, 0)),
    reinvest: reinvestShare(settings, depot),
    yieldRate,
    inflation: ONE.plus(
      new MoneyDecimal(Math.max(settings.inflationPercent, 0)).dividedBy(HUNDRED),
    ),
    months: toDecember + years * 12,
  };

  const growthLow = MoneyDecimal.max(growth.minus(SCENARIO_SPREAD), 0);
  const growthHigh = growth.plus(SCENARIO_SPREAD);
  const base = simulate({ ...common, growth });
  const low = simulate({ ...common, growth: growthLow });
  const high = simulate({ ...common, growth: growthHigh });

  const points = Array.from({ length: years + 1 }, (_, index) => {
    const month = toDecember + index * 12;
    return {
      year: startYear + index,
      base: base[month],
      low: low[month],
      high: high[month],
    };
  });

  const target = new MoneyDecimal(Math.max(settings.targetMonthly, 0));
  const reach = (series: readonly DecimalInstance[], amount: DecimalInstance) =>
    firstYearReaching(series, amount, startYear, startMonth);
  const now = base[0];
  const milestones: SnowballMilestone[] = MILESTONES.filter(
    (amount) => now.lessThan(amount) && target.greaterThan(amount),
  )
    .slice(-(MAX_MILESTONES - 1))
    .map((amount) => ({
      amount,
      year: reach(base, new MoneyDecimal(amount)),
      isTarget: false,
    }));
  if (target.greaterThan(0)) {
    milestones.push({
      amount: settings.targetMonthly,
      year: reach(base, target),
      isTarget: true,
    });
  }

  return {
    today: now,
    points,
    targetYear: target.greaterThan(0) ? reach(base, target) : null,
    targetYearEarliest: target.greaterThan(0) ? reach(high, target) : null,
    targetYearLatest: target.greaterThan(0) ? reach(low, target) : null,
    milestones,
    growthPercent: growth,
    growthHighPercent: growthHigh,
    growthLowPercent: growthLow,
    yieldPercent: yieldRate,
  };
}

export interface SnowballHistoryPoint {
  year: number;
  /** Erhaltene Nettodividende des Jahres ÷ 12, in Nennwerten. */
  monthly: DecimalInstance;
}

/**
 * Der bisherige Weg (seit 2.32.0): je abgeschlossenem Kalenderjahr vor
 * `startYear` die erhaltene Nettodividende ÷ 12 — vom ersten Jahr mit einer
 * Zahlung an, Jahre ohne Zahlung dazwischen mit 0. Das laufende Jahr fehlt:
 * Es ist noch nicht vorbei, und „heute" zeigt schon der erste Punkt der
 * Hochrechnung.
 */
export function snowballHistory(
  payments: readonly AnalyticsPayment[],
  startYear: number,
): SnowballHistoryPoint[] {
  const past = yearlyBuckets(payments).filter(
    (bucket) => bucket.year < startYear && bucket.net.isPositive(),
  );
  if (past.length === 0) return [];
  const byYear = new Map(past.map((bucket) => [bucket.year, bucket.net.toDecimal()]));
  const history: SnowballHistoryPoint[] = [];
  for (let year = past[0].year; year < startYear; year += 1) {
    history.push({
      year,
      monthly: (byYear.get(year) ?? new MoneyDecimal(0)).dividedBy(TWELVE),
    });
  }
  return history;
}

/**
 * Monate bis zum Ziel im Basisszenario, gerechnet wie {@link projectSnowball},
 * aber Monat für Monat geprüft (seit 2.32.0): Das Jahresraster sagt bei einem
 * Kauf meist „gleiches Jahr", die Monate zeigen, was er wirklich bewegt.
 * `extraAnnualNet` ist zusätzliche Nettodividende im Jahr ab heute (ein
 * Einmalkauf), `extraSavings` zusätzliche Sparrate im Monat. 0 = schon
 * erreicht, `null` = ohne Ziel oder nicht innerhalb des Horizonts.
 */
export function monthsToTarget({
  depot,
  settings,
  netRatio,
  extraAnnualNet,
  extraSavings = 0,
  years = SNOWBALL_YEARS,
}: {
  depot: DepotAssumptions;
  settings: SnowballSettings;
  netRatio: DecimalInstance | null;
  extraAnnualNet?: DecimalInstance;
  extraSavings?: number;
  years?: number;
}): number | null {
  const target = new MoneyDecimal(Math.max(settings.targetMonthly, 0));
  if (!target.greaterThan(0)) return null;
  const ratio = netRatio?.greaterThan(0) ? netRatio : ONE;
  const growth =
    settings.growthPercent === null
      ? depot.growthPercent
      : new MoneyDecimal(settings.growthPercent);
  const yieldRate =
    settings.yieldPercent === null
      ? depot.yieldPercent
      : new MoneyDecimal(settings.yieldPercent);
  const growthFactor = ONE.plus(growth.dividedBy(HUNDRED));
  const yieldShare = yieldRate.dividedBy(HUNDRED);
  const savings = new MoneyDecimal(Math.max(settings.monthlySavings + extraSavings, 0));
  // Kaufkraft je Monat: zwölf Schritte ergeben genau die Jahresinflation.
  const monthlyInflation = ONE.plus(
    new MoneyDecimal(Math.max(settings.inflationPercent, 0)).dividedBy(HUNDRED),
  ).pow(ONE.dividedBy(TWELVE));
  const monthlyNet = (annual: DecimalInstance) => annual.times(ratio).dividedBy(TWELVE);
  const reinvested = reinvestShare(settings, depot);

  let annual = depot.annualGross.plus(
    (extraAnnualNet ?? new MoneyDecimal(0)).dividedBy(ratio),
  );
  let deflator = ONE;
  let previous = monthlyNet(annual);
  if (previous.greaterThanOrEqualTo(target)) return 0;
  for (let month = 1; month <= years * 12; month += 1) {
    const invested = savings.plus(monthlyNet(annual).times(reinvested));
    annual = annual.plus(invested.times(yieldShare));
    if (month % 12 === 0) annual = annual.times(growthFactor);
    deflator = deflator.times(monthlyInflation);
    const real = monthlyNet(annual).dividedBy(deflator);
    if (real.greaterThanOrEqualTo(target)) {
      // Anteilig im Monat (seit 2.33.1): Ganze Monate rundeten kleine Käufe
      // auf „0 früher" ab, gerade ohne Reinvestieren.
      const share = target.minus(previous).dividedBy(real.minus(previous));
      return month - 1 + share.toNumber();
    }
    previous = real;
  }
  return null;
}

/**
 * Nettodividende je Monat im Basisszenario für die nächsten `months` Monate,
 * in **Nennwerten** (seit 2.34.0, für die Termine im Fortschritt, §15.4):
 * dieselben Schritte wie {@link monthsToTarget}, aber ohne Inflation, weil
 * Meilensteine und Fixkosten in Euro von damals zählen. Index 0 ist heute,
 * Index 1 der nächste Monat.
 */
export function projectMonthlyNet({
  depot,
  settings,
  netRatio,
  months,
}: {
  depot: DepotAssumptions;
  settings: SnowballSettings;
  netRatio: DecimalInstance | null;
  months: number;
}): DecimalInstance[] {
  const ratio = netRatio?.greaterThan(0) ? netRatio : ONE;
  const growth =
    settings.growthPercent === null
      ? depot.growthPercent
      : new MoneyDecimal(settings.growthPercent);
  const yieldRate =
    settings.yieldPercent === null
      ? depot.yieldPercent
      : new MoneyDecimal(settings.yieldPercent);
  const growthFactor = ONE.plus(growth.dividedBy(HUNDRED));
  const yieldShare = yieldRate.dividedBy(HUNDRED);
  const savings = new MoneyDecimal(Math.max(settings.monthlySavings, 0));
  const monthlyNet = (annual: DecimalInstance) => annual.times(ratio).dividedBy(TWELVE);
  const reinvested = reinvestShare(settings, depot);

  let annual = depot.annualGross;
  const series: DecimalInstance[] = [monthlyNet(annual)];
  for (let month = 1; month <= months; month += 1) {
    const invested = savings.plus(monthlyNet(annual).times(reinvested));
    annual = annual.plus(invested.times(yieldShare));
    if (month % 12 === 0) annual = annual.times(growthFactor);
    series.push(monthlyNet(annual));
  }
  return series;
}

/**
 * Wie viele Monate ein Kauf oder eine Sparrate das Ziel vorzieht (seit
 * 2.32.0, seit 2.33.1 mit Monatsbruchteilen). Ohne den Zusatz wird bis zum doppelten Horizont gerechnet: Ohne
 * Sparpläne liegt das Ziel oft jenseits von 30 Jahren, und gerade dann ist
 * der Abstand die Nachricht. `null`, wenn es nichts vorzuziehen gibt: kein
 * Ziel, schon erreicht, mit dem Zusatz nicht innerhalb des Horizonts oder
 * ohne ihn auch im doppelten nicht.
 */
export function monthsEarlier(
  input: Parameters<typeof monthsToTarget>[0],
): number | null {
  const without = monthsToTarget({
    ...input,
    extraAnnualNet: new MoneyDecimal(0),
    extraSavings: 0,
    years: (input.years ?? SNOWBALL_YEARS) * 2,
  });
  const withExtra = monthsToTarget(input);
  if (without === null || without === 0 || withExtra === null) return null;
  return without - withExtra;
}

/** Diagramm: Jahre nach dem vorsichtigen Zieljahr und Mindestlänge ab heute. */
const CHART_YEARS_AFTER_TARGET = 3;
const CHART_MIN_YEARS = 10;

/**
 * Letztes Jahr im Diagramm (seit 2.32.0): kurz nach dem Zieljahr des
 * vorsichtigen Szenarios, mindestens zehn Jahre ab heute. Bis zum Ende des
 * Horizonts gezeichnet, wuchs die Kurve so weit über das Ziel hinaus, dass
 * die Ziellinie am Boden klebte und der Weg dorthin nicht zu sehen war. Ohne
 * erreichtes Ziel bleibt es beim ganzen Horizont.
 */
export function snowballChartEndYear(result: SnowballResult, startYear: number): number {
  const last = result.points[result.points.length - 1].year;
  if (result.targetYearLatest === null) return last;
  return Math.min(
    last,
    Math.max(
      result.targetYearLatest + CHART_YEARS_AFTER_TARGET,
      startYear + CHART_MIN_YEARS,
    ),
  );
}
