import { EUR, Money, type DecimalInstance } from "@/lib/money";
import { aggregateInRange, type AnalyticsPayment, type RefDate } from "@/lib/statistics";
import { computeTimeProgress, goalPeriod } from "./period";
import type { Goal, GoalProgress, GoalStatus } from "./types";

const ZERO = Money.zero(EUR);

/**
 * Zielerreichung in Prozentpunkten: actual / target × 100. Der Zielbetrag ist
 * per DB-Constraint und Validierung immer > 0; die Division laeuft decimal-sicher
 * ueber {@link Money.toDecimal}. Es wird hier nicht gerundet — die Anzeige rundet
 * ueber formatPercent (R-4).
 */
function achievementPercent(actual: Money, target: Money): DecimalInstance {
  return actual.toDecimal().div(target.toDecimal()).times(100);
}

/**
 * Fachlicher Zielstatus aus Zeitraum und tatsaechlichem Fortschritt (Auftrag §6).
 * Reihenfolge der Ableitung:
 * 1. Zeitraum noch nicht begonnen → `upcoming`.
 * 2. Zielbetrag uebertroffen (actual > target) → `exceeded` (terminaler Zustand,
 *    bleibt auch nach Periodenende bestehen).
 * 3. Zielbetrag exakt erreicht (actual === target) → `reached`.
 * 4. Zeitraum vollstaendig vergangen und Ziel nicht erreicht → `missed`.
 * 5. andernfalls → `active`.
 */
function deriveStatus(
  actual: Money,
  target: Money,
  timeStatus: "upcoming" | "current" | "ended",
): GoalStatus {
  if (timeStatus === "upcoming") return "upcoming";
  const comparison = actual.compareTo(target);
  if (comparison > 0) return "exceeded";
  if (comparison === 0) return "reached";
  // actual < target
  return timeStatus === "ended" ? "missed" : "active";
}

/**
 * Vollstaendiger, decimal-sicherer Zielfortschritt (Auftrag §9/§10). Erwartet
 * bereits geparste Analytics-Zahlungen mit **effektivem** Zahlungsdatum
 * (CALCULATION_RULES.md §10) — genau die Datenbasis, die Dashboard und Statistik
 * verwenden. Damit sind Zielstand, Dashboard, Statistik und der gefilterte
 * Drill-down (§24) zwangslaeufig konsistent.
 *
 * Die uebergebenen Zahlungen enthalten ausschliesslich gueltige, aktive
 * Eingaenge (`archived_at is null`): stornierte und dauerhaft geloeschte
 * Zahlungen sind ausgeschlossen, archivierte Unternehmen und Depots ueber ihre
 * weiterhin aktiven Zahlungen enthalten. Es fliessen keine erwarteten,
 * geschaetzten oder prognostizierten Betraege ein.
 */
export function computeGoalProgress(
  goal: Goal,
  payments: readonly AnalyticsPayment[],
  ref: RefDate,
): GoalProgress {
  const period = goalPeriod(goal);
  const target = goal.targetAmount;
  const actual = aggregateInRange(payments, period).net;
  const time = computeTimeProgress(period, ref);
  const status = deriveStatus(actual, target, time.status);

  const belowTarget = actual.compareTo(target) < 0;
  const remaining = belowTarget ? target.subtract(actual) : ZERO;
  const overshoot = actual.compareTo(target) > 0 ? actual.subtract(target) : ZERO;

  return {
    goal,
    period,
    status,
    time,
    target,
    actual,
    percent: achievementPercent(actual, target),
    remaining,
    overshoot,
  };
}

/**
 * Stabile Sortierung mehrerer Ziele fuer Uebersichten (Auftrag §9). Gruppen in
 * fester Reihenfolge — aktiv/erreicht/uebertroffen (laufend) zuerst, dann
 * bevorstehend, zuletzt beendet — und innerhalb jeder Gruppe der juengste
 * Zeitraum zuerst. Monatsziele nach dem Monat, Jahresziele vor Monatszielen
 * desselben Startdatums. Deterministischer Tiebreaker ueber die technische ID.
 */
export function sortGoalProgress(items: readonly GoalProgress[]): GoalProgress[] {
  const groupRank: Record<GoalStatus, number> = {
    active: 0,
    reached: 0,
    exceeded: 0,
    upcoming: 1,
    missed: 2,
  };
  return [...items].sort((a, b) => {
    const byGroup = groupRank[a.status] - groupRank[b.status];
    if (byGroup !== 0) return byGroup;
    // Juengster Zeitraum zuerst (spaeteres Startdatum zuerst).
    if (a.period.start !== b.period.start) {
      return a.period.start < b.period.start ? 1 : -1;
    }
    if (a.period.end !== b.period.end) {
      return a.period.end < b.period.end ? 1 : -1;
    }
    return a.goal.id < b.goal.id ? -1 : a.goal.id > b.goal.id ? 1 : 0;
  });
}
