import { useOutletContext } from "react-router";
import type { GoalProgress, TimeStatus } from "@/lib/goals";

/**
 * Was die Zielseite an ihre Reiter weitergibt: die bereits gruppierten und
 * sortierten Ziele. Bearbeiten und Loeschen stehen auf der Detailseite.
 *
 * Eigene Datei wie im Statistikbereich (`statistics/context.ts`) — so bleibt
 * der Reiter eine reine Komponentendatei (Fast Refresh) und laesst sich ohne
 * die Seite testen.
 */
export interface GoalsContext {
  byStatus: Record<TimeStatus, GoalProgress[]>;
}

export function useGoalsContext(): GoalsContext {
  return useOutletContext<GoalsContext>();
}
