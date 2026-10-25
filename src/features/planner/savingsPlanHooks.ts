import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSavingsPlans,
  updateSavingsPlans,
} from "@/lib/supabase/repositories/profiles";
import {
  parseSavingsPlans,
  toStoredSavingsPlans,
  type SavingsPlan,
} from "./savingsPlans";

const SAVINGS_PLANS_KEY = ["savings-plans"] as const;

export function useSavingsPlans() {
  return useQuery({
    queryKey: SAVINGS_PLANS_KEY,
    queryFn: fetchSavingsPlans,
    select: parseSavingsPlans,
  });
}

/**
 * Speichert die ganze Liste. Der Cache wird sofort gesetzt, damit die Seite
 * ohne Umlauf folgt; schlägt das Speichern fehl, lädt die Abfrage neu.
 */
export function useSaveSavingsPlans() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plans: readonly SavingsPlan[]) =>
      updateSavingsPlans(toStoredSavingsPlans(plans)),
    onMutate: (plans) => {
      queryClient.setQueryData(SAVINGS_PLANS_KEY, toStoredSavingsPlans(plans));
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: SAVINGS_PLANS_KEY }),
  });
}

/** Kurze Kennung für einen neuen Plan (8 Zeichen, base36). */
export function newSavingsPlanId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
}
