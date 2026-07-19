import { Money } from "@/lib/money";
import type { CurrencyCode } from "@/lib/money";

export interface NetAmountInvarianceInput {
  grossAmount: Money;
  netAmount: Money;
  withholdingTax: Money;
  domesticTax: Money;
  solidaritySurcharge?: Money | undefined;
  churchTax?: Money | undefined;
  fees?: Money | undefined;
}

export interface NetAmountInvarianceResult {
  /** Differenz "erwartetes Netto minus tatsaechliches Netto"; 0 bei exakter Uebereinstimmung. */
  difference: Money;
  withinTolerance: boolean;
}

/** Toleranzband der DB-CHECK-Constraint `net_amount_invariance` (CALCULATION_RULES.md §4). */
const TOLERANCE_DECIMAL = "0.02";

/**
 * Client-seitige Vorabpruefung der Betragsinvariante — spiegelt exakt die
 * Postgres-CHECK-Constraint `net_amount_invariance` (0009_dividend_payments.sql),
 * damit Nutzer die Abweichung vor dem Speichern sehen und bestaetigen koennen
 * (CALCULATION_RULES.md §4: "niemals stilles Anpassen eines Wertes").
 */
export function checkNetAmountInvariance(
  input: NetAmountInvarianceInput,
): NetAmountInvarianceResult {
  const currency = input.grossAmount.currency;
  const zero = Money.zero(currency);

  let expectedNet = input.grossAmount;
  expectedNet = expectedNet.subtract(input.withholdingTax);
  expectedNet = expectedNet.subtract(input.domesticTax);
  expectedNet = expectedNet.subtract(input.solidaritySurcharge ?? zero);
  expectedNet = expectedNet.subtract(input.churchTax ?? zero);
  expectedNet = expectedNet.subtract(input.fees ?? zero);

  const difference = expectedNet.subtract(input.netAmount);
  const tolerance = Money.fromString(TOLERANCE_DECIMAL, currency);
  const negativeTolerance = tolerance.negate();

  const withinTolerance =
    difference.compareTo(negativeTolerance) >= 0 && difference.compareTo(tolerance) <= 0;

  return { difference, withinTolerance };
}

export type { CurrencyCode };
