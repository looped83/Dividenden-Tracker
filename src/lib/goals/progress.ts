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
  // Compute achievement percentage
  // Note: target > 0 is guaranteed by DB constraint (goals.target_amount > 0)
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
 * In welcher Ordnung eine Zielgruppe gelesen wird. Die Zielseite zeigt die drei
 * Gruppen in eigenen Reitern; jede beantwortet eine andere Frage, und deshalb
 * hat jede ihre eigene sinnvolle Reihenfolge.
 */
export type GoalOrder = "current" | "upcoming" | "ended";

/** Jahresziel vor Monatsziel: der groessere Zeitraum ist der Rahmen des kleineren. */
function typeRank(item: GoalProgress): number {
  return item.goal.goalType === "annual" ? 0 : 1;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Stabile Sortierung einer Zielgruppe (Auftrag §9).
 *
 * - `current` — was gerade laeuft: das Jahresziel als Rahmen zuerst, darunter
 *   die Monatsziele, jeweils der juengste Zeitraum oben.
 * - `upcoming` — was als **naechstes** kommt, steht oben. Zuvor war es
 *   umgekehrt: Das am weitesten entfernte Ziel stand zuerst, und der naechste
 *   Zeitraum lag am Ende der Liste.
 * - `ended` — das zuletzt beendete oben. Zuvor entschied der Zielstatus: Alles
 *   Erreichte stand vor allem Verfehlten, wodurch die Jahre durcheinander
 *   liefen.
 *
 * Bei gleichem Zeitraum entscheidet die Zielart, danach die technische Id —
 * damit ist die Reihenfolge bei jedem Aufruf dieselbe.
 */
export function sortGoalProgress(
  items: readonly GoalProgress[],
  order: GoalOrder = "current",
): GoalProgress[] {
  return [...items].sort((a, b) => {
    if (order === "upcoming") {
      const byStart = compareText(a.period.start, b.period.start);
      if (byStart !== 0) return byStart;
    } else if (order === "ended") {
      const byEnd = compareText(b.period.end, a.period.end);
      if (byEnd !== 0) return byEnd;
    } else {
      const byType = typeRank(a) - typeRank(b);
      if (byType !== 0) return byType;
      const byStart = compareText(b.period.start, a.period.start);
      if (byStart !== 0) return byStart;
    }
    const byType = typeRank(a) - typeRank(b);
    if (byType !== 0) return byType;
    return compareText(a.goal.id, b.goal.id);
  });
}
