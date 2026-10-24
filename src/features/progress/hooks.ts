import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { EUR, Money, MoneyDecimal } from "@/lib/money";
import type { FixedCost } from "@/lib/progress";
import { fetchFixedCosts, updateFixedCosts } from "@/lib/supabase/repositories/profiles";

const FIXED_COSTS_KEY = ["fixed-costs"] as const;

/** Obergrenzen, gegen die auch der Dialog prüft. */
export const FIXED_COSTS_MAX = 20;
export const FIXED_COST_NAME_MAX = 40;
export const FIXED_COST_AMOUNT_MAX = 100_000;

const storedCost = z.object({
  name: z.string().trim().min(1).max(FIXED_COST_NAME_MAX),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .refine((value) => {
      const amount = new MoneyDecimal(value);
      return amount.gt(0) && amount.lte(FIXED_COST_AMOUNT_MAX);
    }),
});

/**
 * Liest die gespeicherte Liste. Eine einzelne ungültige Position (ältere
 * Fassung, Handeingriff) fällt weg, statt die ganze Liste zu verwerfen.
 */
function parseFixedCosts(raw: unknown): FixedCost[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = storedCost.safeParse(entry);
    return parsed.success
      ? [{ name: parsed.data.name, amount: Money.fromString(parsed.data.amount, EUR) }]
      : [];
  });
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

function toStored(costs: readonly FixedCost[]) {
  return costs.map((cost) => ({ name: cost.name, amount: cost.amount.toStringValue() }));
}
