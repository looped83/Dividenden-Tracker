import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGoal,
  createGoals,
  deleteGoal,
  fetchGoalById,
  fetchGoals,
  mapGoal,
  updateGoal,
  type GoalInsert,
  type GoalRow,
  type GoalUpdate,
} from "@/lib/supabase/repositories/goals";
import {
  deriveMonthlyGoals,
  type DerivedMonthlyGoal,
  type ExpectedRest,
  type Goal,
} from "@/lib/goals";
import {
  isoFromRef,
  monthlyBuckets,
  yearEndForecast,
  type AnalyticsPayment,
  type RefDate,
} from "@/lib/statistics";
import { announcedForForecast } from "@/lib/calendar/summary";
import { useEffectivePayments } from "@/features/dashboard/hooks";
import { useCalendarEvents } from "@/features/calendar/hooks";

/**
 * Zentraler Query-Key-Namespace aller Zielabfragen (Auftrag §30/§32). Jede
 * Zielmutation invalidiert `["goals"]` und aktualisiert damit Zielübersicht,
 * Detailansicht und Dashboard-Zielsektion gemeinsam. Der Fortschritt selbst
 * leitet sich aus der Zahlungshistorie (`PAYMENT_HISTORY_KEY`) ab; deren
 * Invalidierung durch Zahlungs-/Import-Mutationen aktualisiert die Zielstände
 * automatisch, ohne dass Ziele hier zusätzlich invalidiert werden müssen.
 */
const GOALS_KEY = ["goals"] as const;

export interface GoalWithMeta extends Goal {
  /** Fuer Optimistic Concurrency in Bearbeiten-Dialogen. */
  updatedAt: string;
}

// Ausserhalb der Hooks, damit `select` eine stabile Referenz hat und nicht bei
// jedem Rendern erneut laeuft (siehe `useDashboardPayments`).
function toGoalWithMeta(row: GoalRow): GoalWithMeta {
  return { ...mapGoal(row), updatedAt: row.updated_at };
}

function toGoalsWithMeta(rows: GoalRow[]): GoalWithMeta[] {
  return rows.map(toGoalWithMeta);
}

export function useGoals() {
  return useQuery({
    queryKey: GOALS_KEY,
    queryFn: fetchGoals,
    select: toGoalsWithMeta,
  });
}

export function useGoal(id: string | undefined) {
  return useQuery({
    queryKey: [...GOALS_KEY, "detail", id],
    queryFn: () => fetchGoalById(id ?? ""),
    enabled: Boolean(id),
    select: toGoalWithMeta,
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

export function useCreateGoals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inputs: readonly GoalInsert[]) => createGoals(inputs),
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
 * Dashboard (`useDashboardPayments`, geteilter Cache), angereichert um den
 * effektiven Monat je Ausschuettungsplan (§10). Dadurch stimmen Zielstand,
 * Dashboard, Statistik und der gefilterte Drill-down exakt überein. Es zaehlen
 * ausschliesslich gueltige, aktive Eingaenge — stornierte/geloeschte
 * Zahlungen sind ausgeschlossen, archivierte Unternehmen/Depots enthalten.
 */
export function useGoalProgressPayments(): {
  payments: AnalyticsPayment[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const { payments, paymentsQuery, securitiesQuery } = useEffectivePayments();

  return {
    payments,
    isLoading: paymentsQuery.isLoading || securitiesQuery.isLoading,
    isError: paymentsQuery.isError || securitiesQuery.isError,
    error: paymentsQuery.error ?? securitiesQuery.error ?? null,
  };
}

/**
 * Prognose des laufenden Jahres (CALCULATION_RULES.md §9.7) samt dem noch
 * erwarteten Rest, aus dem `computeGoalCourse` die Hochrechnung je Ziel
 * bildet. Dieselbe Rechnung wie auf der Übersicht.
 */
export function useYearEndForecast(
  payments: readonly AnalyticsPayment[],
  today: RefDate,
): { forecast: ReturnType<typeof yearEndForecast>; rest: ExpectedRest } {
  const calendarEvents = useCalendarEvents().data;
  return React.useMemo(() => {
    const forecast = yearEndForecast(
      payments,
      today,
      announcedForForecast(calendarEvents ?? [], isoFromRef(today)),
    );
    return {
      forecast,
      rest: {
        year: forecast.forecast.subtract(forecast.received),
        byMonth: forecast.restByMonth,
      },
    };
  }, [payments, today, calendarEvents]);
}

/**
 * Monatsziele, die aus dem Jahresziel folgen (§13.2): Muster und Erhaltenes
 * des laufenden Jahres aus derselben Prognose wie die Monatsbalken der
 * Zielseite. Leer, wenn es nichts abzuleiten gibt.
 */
export function useDerivedMonthlyGoals({
  annual,
  goals,
  payments,
  forecast,
  today,
}: {
  annual: Goal | null;
  goals: readonly Goal[];
  payments: readonly AnalyticsPayment[];
  forecast: ReturnType<typeof yearEndForecast>;
  today: RefDate;
}): DerivedMonthlyGoal[] {
  return React.useMemo(() => {
    if (!annual) return [];
    const received = monthlyBuckets(payments, today.year).map((bucket) => bucket.net);
    const pattern = received.map((net, index) => net.add(forecast.restByMonth[index]));
    return deriveMonthlyGoals({ annual, goals, pattern, received, ref: today });
  }, [annual, goals, payments, forecast, today]);
}
