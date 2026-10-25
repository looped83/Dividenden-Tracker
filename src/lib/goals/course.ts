import { MoneyDecimal, type DecimalInstance, type Money } from "@/lib/money";
import type { RefDate } from "@/lib/statistics";
import type { GoalProgress } from "./types";

/**
 * Kurs eines Ziels (seit 2.31.0): Wo landet es bis zum Ende seines
 * Zeitraums? Eine **Hochrechnung** neben dem Zielfortschritt, kein Teil
 * davon — Status, Prozent und Restbetrag bleiben frei von erwarteten
 * Beträgen (CALCULATION_RULES.md §13.1).
 *
 * - `onTrack`: Die Hochrechnung erreicht den Zielbetrag.
 * - `close`: Ihr fehlen höchstens 5 %.
 * - `behind`: Ihr fehlt mehr.
 */
export type GoalCourseKind = "onTrack" | "close" | "behind";

export interface GoalCourse {
  kind: GoalCourseKind;
  /** Erhalten + im Zeitraum noch erwartet. */
  expected: Money;
  /** Hochrechnung in Prozentpunkten des Zielbetrags, ungerundet. */
  percent: DecimalInstance;
}

/**
 * Der noch erwartete Rest des laufenden Jahres, wie ihn `yearEndForecast`
 * liefert (§9.7) — dieselbe Prognose wie auf der Übersicht und in den
 * gestreiften Balken der Zielseite.
 */
export interface ExpectedRest {
  /** Rest des Jahres (`forecast − received`). */
  year: Money;
  /** Rest je Monat, Index 0 = Januar; summiert genau `year`. */
  byMonth: readonly Money[];
}

/** Bis zu diesem Anteil unter dem Ziel gilt die Hochrechnung als knapp. */
const CLOSE_SHARE = new MoneyDecimal("0.95");
const HUNDRED = new MoneyDecimal(100);

/**
 * Hochrechnung eines Ziels bis zum Ende seines Zeitraums:
 * `erhalten + noch erwartet`. Nur für Ziele, die im laufenden Jahr noch
 * offen sind — das Jahresziel dieses Jahres und seine Monatsziele ab dem
 * laufenden Monat, solange sie weder erreicht noch übertroffen sind. Für
 * alles andere `null`: Vergangenes hat ein Ergebnis, und über das Jahr hinaus
 * kennt die Prognose nichts.
 */
export function computeGoalCourse(
  progress: GoalProgress,
  rest: ExpectedRest,
  ref: RefDate,
): GoalCourse | null {
  const { goal, status } = progress;
  if (status !== "active" && status !== "upcoming") return null;
  if (goal.year !== ref.year) return null;

  let pending: Money;
  if (goal.goalType === "annual") {
    pending = rest.year;
  } else {
    if (goal.month === null) return null;
    pending = rest.byMonth[goal.month - 1];
  }

  const expected = pending.isPositive() ? progress.actual.add(pending) : progress.actual;
  const ratio = expected.toDecimal().div(progress.target.toDecimal());
  const kind: GoalCourseKind = ratio.gte(1)
    ? "onTrack"
    : ratio.gte(CLOSE_SHARE)
      ? "close"
      : "behind";
  return { kind, expected, percent: ratio.times(HUNDRED) };
}
