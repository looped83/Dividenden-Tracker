import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGoal,
  deleteGoal,
  fetchGoalById,
  fetchGoals,
  mapGoal,
  updateGoal,
  type GoalInsert,
  type GoalUpdate,
} from "@/lib/supabase/repositories/goals";
import type { Goal } from "@/lib/goals";
import {
  normalizePayoutMonths,
  withEffectiveDates,
  type AnalyticsPayment,
} from "@/lib/statistics";
import { useDashboardPayments } from "@/features/dashboard/hooks";
import { useSecurities } from "@/features/securities/hooks";

/**
 * Zentraler Query-Key-Namespace aller Zielabfragen (Auftrag §30/§32). Jede
 * Zielmutation invalidiert `["goals"]` und aktualisiert damit Zielübersicht,
 * Detailansicht und Dashboard-Zielsektion gemeinsam. Der Fortschritt selbst
 * leitet sich aus den Zahlungsdaten (`["payments","dashboard"]`) ab; deren
 * Invalidierung durch Zahlungs-/Import-Mutationen aktualisiert die Zielstände
 * automatisch, ohne dass Ziele hier zusätzlich invalidiert werden müssen.
 */
export const GOALS_KEY = ["goals"] as const;

export interface GoalWithMeta extends Goal {
  /** Fuer Optimistic Concurrency in Bearbeiten-Dialogen. */
  updatedAt: string;
}

export function useGoals() {
  return useQuery({
    queryKey: GOALS_KEY,
    queryFn: fetchGoals,
    select: (rows): GoalWithMeta[] =>
      rows.map((row) => ({ ...mapGoal(row), updatedAt: row.updated_at })),
  });
}

export function useGoal(id: string | undefined) {
  return useQuery({
    queryKey: [...GOALS_KEY, "detail", id],
    queryFn: () => fetchGoalById(id ?? ""),
    enabled: Boolean(id),
    select: (row): GoalWithMeta => ({ ...mapGoal(row), updatedAt: row.updated_at }),
  });
}

function invalidateGoals(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: GOALS_KEY });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GoalInsert) => createGoal(input),
    onSuccess: () => {
      invalidateGoals(queryClient);
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
      expectedUpdatedAt,
    }: {
      id: string;
      input: GoalUpdate;
      expectedUpdatedAt?: string;
    }) => updateGoal(id, input, expectedUpdatedAt),
    onSuccess: () => {
      invalidateGoals(queryClient);
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGoal(id),
    onSuccess: () => {
      invalidateGoals(queryClient);
    },
  });
}

/**
 * Datenbasis der Zielfortschritte: dieselbe aktive Dividendenhistorie wie das
 * Dashboard (`["payments","dashboard"]`, geteilter Cache), angereichert um den
 * effektiven Monat je Ausschuettungsplan (§10). Dadurch stimmen Zielstand,
 * Dashboard, Statistik und der gefilterte Drill-down exakt überein. Es werden
 * ausschliesslich gueltige, aktive Eingaenge geladen — stornierte/geloeschte
 * Zahlungen sind ausgeschlossen, archivierte Unternehmen/Depots enthalten.
 */
export function useGoalProgressPayments(): {
  payments: AnalyticsPayment[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const paymentsQuery = useDashboardPayments();
  const securitiesQuery = useSecurities();

  const payoutBySecurity = React.useMemo(() => {
    const map = new Map<string, number[]>();
    for (const security of securitiesQuery.data ?? []) {
      const months = normalizePayoutMonths(security.payout_months);
      if (months.length > 0) map.set(security.id, months);
    }
    return map;
  }, [securitiesQuery.data]);

  const payments = React.useMemo(
    () => withEffectiveDates(paymentsQuery.data ?? [], payoutBySecurity),
    [paymentsQuery.data, payoutBySecurity],
  );

  return {
    payments,
    isLoading: paymentsQuery.isLoading || securitiesQuery.isLoading,
    isError: paymentsQuery.isError || securitiesQuery.isError,
    error: paymentsQuery.error ?? securitiesQuery.error ?? null,
  };
}
