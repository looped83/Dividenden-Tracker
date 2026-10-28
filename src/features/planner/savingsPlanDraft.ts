import {
  EUR,
  Money,
  MoneyDecimal,
  normalizeGermanDecimalInput,
  toGermanAmountInput,
} from "@/lib/money";
import { newSavingsPlanId } from "./savingsPlanHooks";
import {
  SAVINGS_PLAN_AMOUNT_MAX,
  type SavingsInterval,
  type SavingsPlan,
} from "./savingsPlans";

/**
 * Entwurf eines Sparplans (seit 2.44.0) für `SavingsPlanFields`: Die
 * Eingaben bleiben Text, bis `planFromDraft` sie beim Speichern prüft und
 * wandelt.
 */
export interface SavingsPlanDraft {
  /** Kennung des gespeicherten Plans; fehlt sie, entsteht ein neuer. */
  id?: string;
  amount: string;
  interval: SavingsInterval;
  nextDate: string;
  depotId: string;
  paused: boolean;
}

export function draftFromPlan(plan: SavingsPlan): SavingsPlanDraft {
  return {
    id: plan.id,
    amount: toGermanAmountInput(plan.amount.toStringValue().replace(/\.00$/, "")),
    interval: plan.interval,
    nextDate: plan.nextDate ?? "",
    depotId: plan.depotId ?? "",
    paused: plan.paused,
  };
}

export function emptyDraft(depotId: string | null | undefined): SavingsPlanDraft {
  return {
    amount: "",
    interval: "monthly",
    nextDate: "",
    depotId: depotId ?? "",
    paused: false,
  };
}

/** Der geprüfte Plan oder der Grund, warum er so nicht gespeichert wird. */
export function planFromDraft(
  draft: SavingsPlanDraft,
  securityId: string,
): SavingsPlan | string {
  const canonical = normalizeGermanDecimalInput(draft.amount);
  if (!/^\d+(\.\d{1,2})?$/.test(canonical)) return "Gib eine Rate ein.";
  const value = new MoneyDecimal(canonical);
  if (value.lte(0)) return "Die Rate muss größer als 0 sein.";
  if (value.gt(SAVINGS_PLAN_AMOUNT_MAX))
    return "Die Rate darf höchstens 100.000 € betragen.";
  return {
    id: draft.id ?? newSavingsPlanId(),
    securityId,
    depotId: draft.depotId === "" ? null : draft.depotId,
    amount: Money.fromDecimal(value, EUR),
    interval: draft.interval,
    nextDate: draft.nextDate === "" ? null : draft.nextDate,
    paused: draft.paused,
  };
}
