import { describe, expect, it } from "vitest";
import { computePaymentAmounts } from "@/features/payments/computeAmounts";
import type { PaymentFormValues } from "@/features/payments/schemas";

const baseValues = {
  securityId: "sec-1",
  depotId: "depot-1",
  payDate: "2026-03-15",
  paymentType: "regular" as const,
  withholdingTax: "26.37",
  domesticTax: "0",
  solidaritySurcharge: undefined,
  churchTax: undefined,
  fees: undefined,
  quantity: undefined,
  note: "",
};

describe("computePaymentAmounts — Inlandszahlung", () => {
  it("uebernimmt Brutto-/Nettobetrag direkt in Basiswaehrung", () => {
    const values: PaymentFormValues = {
      ...baseValues,
      isForeignCurrency: false,
      grossAmount: "100.00",
      netAmount: "73.63",
      originalCurrency: undefined,
      originalGross: undefined,
      originalNet: undefined,
      fxRate: undefined,
    };
    const result = computePaymentAmounts(values, "EUR");
    expect(result.grossAmount.toStringValue()).toBe("100.00");
    expect(result.netAmount.toStringValue()).toBe("73.63");
    expect(result.originalCurrency).toBe("EUR");
    expect(result.originalGross).toBeUndefined();
  });

  it("wirft bei fehlendem Bruttobetrag", () => {
    const values: PaymentFormValues = {
      ...baseValues,
      isForeignCurrency: false,
      grossAmount: undefined,
      netAmount: "73.63",
      originalCurrency: undefined,
      originalGross: undefined,
      originalNet: undefined,
      fxRate: undefined,
    };
    expect(() => computePaymentAmounts(values, "EUR")).toThrow();
  });
});

describe("computePaymentAmounts — Fremdwaehrungszahlung (R-2)", () => {
  it("berechnet Basiswaehrungsbetraege als Original × Kurs, kaufmaennisch auf 2 Stellen gerundet", () => {
    const values: PaymentFormValues = {
      ...baseValues,
      isForeignCurrency: true,
      grossAmount: undefined,
      netAmount: undefined,
      originalCurrency: "USD",
      originalGross: "120.00",
      originalNet: "88.00",
      fxRate: "0.9234",
    };
    const result = computePaymentAmounts(values, "EUR");
    // 120.00 * 0.9234 = 110.808 -> HALF_UP auf 110.81
    expect(result.grossAmount.toStringValue()).toBe("110.81");
    // 88.00 * 0.9234 = 81.2592 -> HALF_UP auf 81.26
    expect(result.netAmount.toStringValue()).toBe("81.26");
    expect(result.originalCurrency).toBe("USD");
    expect(result.fxRate?.toStringValue()).toBe("0.92340000");
  });

  it("leitet die Dividende je Aktie aus Original-Brutto und Stueckzahl ab", () => {
    const values: PaymentFormValues = {
      ...baseValues,
      isForeignCurrency: true,
      quantity: "10",
      grossAmount: undefined,
      netAmount: undefined,
      originalCurrency: "USD",
      originalGross: "12.00",
      originalNet: "8.80",
      fxRate: "0.92",
    };
    const result = computePaymentAmounts(values, "EUR");
    expect(result.amountPerShare?.toStringValue()).toBe("1.20000000");
  });

  it("wirft bei unvollstaendigen Fremdwaehrungsangaben", () => {
    const values: PaymentFormValues = {
      ...baseValues,
      isForeignCurrency: true,
      grossAmount: undefined,
      netAmount: undefined,
      originalCurrency: "USD",
      originalGross: "120.00",
      originalNet: undefined,
      fxRate: "0.92",
    };
    expect(() => computePaymentAmounts(values, "EUR")).toThrow();
  });
});
