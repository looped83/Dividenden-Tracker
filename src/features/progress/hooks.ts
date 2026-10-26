import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { EUR, Money, MoneyDecimal } from "@/lib/money";
import {
  FIXED_COST_INTERVALS,
  NO_ETAS,
  fixedCost,
  progressEtas,
  type CoverageResult,
  type FixedCost,
  type NextMilestone,
  type ProgressEtas,
} from "@/lib/progress";
import { isoFromRef, type AnalyticsPayment, type RefDate } from "@/lib/statistics";
import { activeMonthlyTotal } from "@/features/planner/savingsPlans";
import { useSavingsPlans } from "@/features/planner/savingsPlanHooks";
import { withPlanSavings } from "@/features/planner/targetTime";
import { netRatio } from "@/features/securities/forecast";
import { useForecastSettings } from "@/features/securities/forecastSettings";
import { useSecuritySnapshots } from "@/features/securities/hooks";
import { depotAssumptions, projectMonthlyNet } from "@/features/securities/snowball";
import { fetchFixedCosts, updateFixedCosts } from "@/lib/supabase/repositories/profiles";

const FIXED_COSTS_KEY = ["fixed-costs"] as const;

/** Obergrenzen, gegen die auch der Dialog prüft. */
export const FIXED_COSTS_MAX = 50;
export const FIXED_COST_NAME_MAX = 40;
export const FIXED_COST_AMOUNT_MAX = 100_000;

const storedCost = z.object({
  id: z.string().min(1).max(16).optional(),
  name: z.string().trim().min(1).max(FIXED_COST_NAME_MAX),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .refine((value) => {
      const amount = new MoneyDecimal(value);
      return amount.gt(0) && amount.lte(FIXED_COST_AMOUNT_MAX);
    }),
  /** Seit 2.34.0; fehlt bei monatlichen Positionen. `amount` ist dann der Betrag je Fälligkeit. */
  every: z.literal(FIXED_COST_INTERVALS).optional(),
});

/**
 * Liest die gespeicherte Liste. Eine einzelne ungültige Position (ältere
 * Fassung, Handeingriff) fällt weg, statt die ganze Liste zu verwerfen.
 * Positionen aus 2.12–2.13 tragen noch keine Kennung: Sie bekommen eine aus
 * ihrer Stelle, die mit dem nächsten Speichern bleibt.
 */
function parseFixedCosts(raw: unknown): FixedCost[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((entry, index) => {
    const parsed = storedCost.safeParse(entry);
    if (!parsed.success) return [];
    let id = parsed.data.id ?? `p${String(index)}`;
    if (seen.has(id)) id = `${id}-${String(index)}`;
    seen.add(id);
    return [
      fixedCost(
        id,
        parsed.data.name,
        Money.fromString(parsed.data.amount, EUR),
        parsed.data.every,
      ),
    ];
  });
}

/** Kurze Kennung für eine neue Position (8 Zeichen, base36). */
export function newFixedCostId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
}

export function useFixedCost(id: string | undefined) {
  const query = useFixedCosts();
  return { ...query, cost: query.data?.find((cost) => cost.id === id) ?? null };
}

export function useFixedCosts() {
  return useQuery({
    queryKey: FIXED_COSTS_KEY,
    queryFn: fetchFixedCosts,
    select: parseFixedCosts,
  });
}

/**
 * Speichert die Liste. Der Cache wird sofort gesetzt, damit die Seite ohne
 * Umlauf folgt; schlägt das Speichern fehl, lädt die Abfrage neu.
 */
export function useSaveFixedCosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (costs: readonly FixedCost[]) => updateFixedCosts(toStored(costs)),
    onMutate: (costs) => {
      queryClient.setQueryData(FIXED_COSTS_KEY, toStored(costs));
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: FIXED_COSTS_KEY }),
  });
}

/**
 * Eine leere Liste wird `null` statt `[]`: Ohne Positionen gibt es nichts zu
 * speichern, und die Testbrücke bindet ein leeres Array als Postgres-Array
 * (`'{}'`), das die Prüfung `profiles_fixed_costs_shape` als Objekt abweist.
 */
function toStored(costs: readonly FixedCost[]) {
  if (costs.length === 0) return null;
  // Monatliche Positionen ohne `every`: Die Liste darf 4 KB nicht überschreiten.
  return costs.map((cost) => ({
    id: cost.id,
    name: cost.name,
    amount: cost.payment.toStringValue(),
    ...(cost.interval !== 1 && { every: cost.interval }),
  }));
}

/** Wie der Schneeball (§14.2): Weiter als 30 Jahre voraus nennt der Fortschritt keinen Termin. */
const ETA_MONTHS = 30 * 12;

/**
 * Termine für die nächsten Meilensteine und offenen Fixkosten (§15.4) aus
 * dem Schneeball: Depotstand, Annahmen und aktive Sparpläne wie im Planer.
 * Ohne Depotstand gibt es keine Termine; die Seite zeigt dann nur Beträge.
 */
export function useProgressEtas({
  payments,
  today,
  milestones,
  coverage,
}: {
  payments: readonly AnalyticsPayment[];
  today: RefDate;
  milestones: readonly NextMilestone[];
  coverage: CoverageResult;
}): ProgressEtas {
  const snapshots = useSecuritySnapshots().data;
  const settings = useForecastSettings().data;
  const plans = useSavingsPlans().data;
  const growth = React.useMemo(() => {
    const depot = snapshots ? depotAssumptions(snapshots) : null;
    if (!depot || !settings) return null;
    const [now, ...future] = projectMonthlyNet({
      depot,
      settings: withPlanSavings(
        settings,
        Math.round(activeMonthlyTotal(plans ?? []).toNumber()),
      ),
      netRatio: netRatio(payments, isoFromRef(today)),
      months: ETA_MONTHS,
    });
    // Nur das Wachstum zählt: Der Depotstand kennt nicht jede Zahlung, die
    // Termine setzen auf dem Erhaltenen auf.
    if (!now.greaterThan(0)) return null;
    return future.map((value) => value.dividedBy(now));
  }, [snapshots, settings, plans, payments, today]);
  return React.useMemo(
    () =>
      growth ? progressEtas({ payments, today, growth, milestones, coverage }) : NO_ETAS,
    [growth, payments, today, milestones, coverage],
  );
}
