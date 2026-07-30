import { useOutletContext } from "react-router";
import type { GoalProgress, TimeStatus } from "@/lib/goals";

/**
 * Was die Zielseite an ihre Reiter weitergibt: die bereits gruppierten und
 * sortierten Ziele plus die Aktionen, die zu den Dialogen der Seite gehoeren.
 *
 * Eigene Datei wie im Statistikbereich (`statistics/context.ts`) — so bleibt
 * der Reiter eine reine Komponentendatei (Fast Refresh) und laesst sich ohne
 * die Seite testen.
 */
export interface GoalsContext {
  byStatus: Record<TimeStatus, GoalProgress[]>;
  onEdit: (goalId: string) => void;
  onDelete: (goalId: string) => void;
}

export function useGoalsContext(): GoalsContext {
  return useOutletContext<GoalsContext>();
}
