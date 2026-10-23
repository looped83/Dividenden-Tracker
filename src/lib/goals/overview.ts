import { EUR, Money, MoneyDecimal, type DecimalInstance } from "@/lib/money";
import {
  aggregateInRange,
  aggregateInYear,
  isoFromRef,
  trailingYearRange,
  type AnalyticsPayment,
  type RefDate,
} from "@/lib/statistics";
import { computeGoalProgress } from "./progress";
import type { Goal, GoalProgress } from "./types";

/**
 * Auswertungen der Zielseite: Zielbilanz über die Jahre, Ø der letzten zwölf
 * Monate gegen das Langfristziel und ein Vorschlag für das nächste
 * Jahresziel. Rein und decimal-sicher wie {@link computeGoalProgress}; die
 * Seite rechnet nichts selbst.
 */

/** Alle Jahresziele mit Fortschritt, das älteste zuerst (Achse der Zielbilanz). */
export function annualGoalHistory(
  goals: readonly Goal[],
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
): GoalProgress[] {
  return goals
    .filter((goal) => goal.goalType === "annual")
    .map((goal) => computeGoalProgress(goal, payments, ref))
    .sort((a, b) => a.goal.year - b.goal.year);
}

/** Wie viele abgeschlossene Jahresziele erreicht wurden. */
export function annualHitRate(history: readonly GoalProgress[]): {
  hit: number;
  total: number;
} {
  const ended = history.filter((p) => p.time.status === "ended");
  return {
    hit: ended.filter((p) => p.status === "reached" || p.status === "exceeded").length,
    total: ended.length,
  };
}

/** Ø Nettodividende pro Monat der zwölf Monate, die heute enden. */
export function trailingMonthlyAverage(
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
): Money {
  const { net } = aggregateInRange(payments, trailingYearRange(isoFromRef(ref)));
  return Money.fromDecimal(net.toDecimal().div(12), EUR);
}

/** Jährliches Wachstum, über das ein Vorschlag höchstens hinausgeht. */
const MAX_GROWTH = new MoneyDecimal("0.3");
const GROWTH_YEARS = 3;
/** Monat, ab dem das nächste Jahr einen Vorschlag bekommt (Oktober). */
const NEXT_YEAR_FROM_MONTH = 10;

/**
 * Mittleres jährliches Wachstum (CAGR) der letzten drei vollen Jahre, auf
 * 0 bis 30 % begrenzt. `null`, wenn das Startjahr leer ist.
 */
export function recentAnnualGrowth(
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
): { growth: DecimalInstance; from: number; to: number } | null {
  const to = ref.year - 1;
  const from = to - GROWTH_YEARS;
  const start = aggregateInYear(payments, from).net.toDecimal();
  const end = aggregateInYear(payments, to).net.toDecimal();
  if (start.lte(0)) return null;
  const raw = end.div(start).pow(new MoneyDecimal(1).div(GROWTH_YEARS)).minus(1);
  const growth = MoneyDecimal.max(0, MoneyDecimal.min(MAX_GROWTH, raw));
  return { growth, from, to };
}

export interface GoalSuggestion {
  year: number;
  /** Auf 100 € gerundet. */
  amount: Money;
  /** Grundlage: die Prognose des laufenden Jahres … */
  forecast: Money;
  /** … und fürs nächste Jahr das Wachstum, das darauf kommt. */
  growth: { growth: DecimalInstance; from: number; to: number } | null;
}

function roundToHundred(value: DecimalInstance): Money {
  return Money.fromDecimal(value.div(100).toDecimalPlaces(0).times(100), EUR);
}

/**
 * Vorschlag für ein fehlendes Jahresziel. Fehlt das laufende Jahr, gilt seine
 * Prognose; ab Oktober bekommt das nächste Jahr einen Vorschlag: Prognose des
 * laufenden Jahres plus das Wachstum der letzten drei Jahre. Sonst `null` —
 * die Zielseite bietet nur an, was gerade ansteht.
 */
export function suggestAnnualGoal(
  goals: readonly Goal[],
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
  forecast: Money,
): GoalSuggestion | null {
  const hasAnnual = (year: number) =>
    goals.some((goal) => goal.goalType === "annual" && goal.year === year);

  if (!hasAnnual(ref.year)) {
    if (!forecast.isPositive()) return null;
    return {
      year: ref.year,
      amount: roundToHundred(forecast.toDecimal()),
      forecast,
      growth: null,
    };
  }
  if (ref.month < NEXT_YEAR_FROM_MONTH || hasAnnual(ref.year + 1)) return null;
  const growth = recentAnnualGrowth(payments, ref);
  const base = forecast.toDecimal().times(growth ? growth.growth.plus(1) : 1);
  if (base.lte(0)) return null;
  return { year: ref.year + 1, amount: roundToHundred(base), forecast, growth };
}
