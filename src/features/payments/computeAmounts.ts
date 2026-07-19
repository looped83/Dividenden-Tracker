import {
  FxRate,
  Money,
  OriginalAmount,
  PerShareAmount,
  Quantity,
  toCurrencyCode,
  type CurrencyCode,
} from "@/lib/money";
import type { PaymentFormValues } from "@/features/payments/schemas";

export interface ComputedPaymentAmounts {
  grossAmount: Money;
  netAmount: Money;
  withholdingTax: Money;
  domesticTax: Money;
  solidaritySurcharge?: Money | undefined;
  churchTax?: Money | undefined;
  fees?: Money | undefined;
  originalCurrency: CurrencyCode;
  originalGross?: OriginalAmount | undefined;
  originalNet?: OriginalAmount | undefined;
  fxRate?: FxRate | undefined;
  quantity?: Quantity | undefined;
  amountPerShare?: PerShareAmount | undefined;
}

/**
 * Verwandelt validierte Formularwerte in Wertobjekte aus lib/money und
 * berechnet bei Fremdwaehrung die Basiswaehrungsbetraege (R-2). Die Zod-
 * Validierung (schemas.ts superRefine) muss vorher bereits sichergestellt
 * haben, dass die je nach `isForeignCurrency` erforderlichen Felder gesetzt
 * und kanonisch sind — hier wird das per Laufzeitfehler nochmals abgesichert.
 */
export function computePaymentAmounts(
  values: PaymentFormValues,
  depotBaseCurrency: string,
): ComputedPaymentAmounts {
  const currency = toCurrencyCode(depotBaseCurrency);
  const withholdingTax = Money.fromString(values.withholdingTax, currency);
  const domesticTax = Money.fromString(values.domesticTax, currency);
  const solidaritySurcharge = values.solidaritySurcharge
    ? Money.fromString(values.solidaritySurcharge, currency)
    : undefined;
  const churchTax = values.churchTax
    ? Money.fromString(values.churchTax, currency)
    : undefined;
  const fees = values.fees ? Money.fromString(values.fees, currency) : undefined;
  const quantity = values.quantity ? Quantity.fromString(values.quantity) : undefined;

  if (values.isForeignCurrency) {
    if (
      !values.originalCurrency ||
      !values.originalGross ||
      !values.originalNet ||
      !values.fxRate
    ) {
      throw new Error("Fremdwaehrungsangaben unvollstaendig.");
    }
    const fxRate = FxRate.fromString(values.fxRate);
    const originalGross = OriginalAmount.fromString(values.originalGross);
    const originalNet = OriginalAmount.fromString(values.originalNet);
    const amountPerShare = quantity
      ? PerShareAmount.derive(originalGross, quantity)
      : undefined;

    return {
      grossAmount: originalGross.convertToBaseCurrency(fxRate, currency),
      netAmount: originalNet.convertToBaseCurrency(fxRate, currency),
      withholdingTax,
      domesticTax,
      solidaritySurcharge,
      churchTax,
      fees,
      originalCurrency: toCurrencyCode(values.originalCurrency),
      originalGross,
      originalNet,
      fxRate,
      quantity,
      amountPerShare,
    };
  }

  if (!values.grossAmount || !values.netAmount) {
    throw new Error("Brutto-/Nettobetrag fehlt.");
  }

  return {
    grossAmount: Money.fromString(values.grossAmount, currency),
    netAmount: Money.fromString(values.netAmount, currency),
    withholdingTax,
    domesticTax,
    solidaritySurcharge,
    churchTax,
    fees,
    originalCurrency: currency,
    quantity,
  };
}
