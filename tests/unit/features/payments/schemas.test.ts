import { describe, expect, it } from "vitest";
import { paymentFormSchema } from "@/features/payments/schemas";

const baseValues = {
  securityId: "00000000-0000-0000-0000-000000000001",
  depotId: "00000000-0000-0000-0000-000000000002",
  payDate: "2026-03-15",
  paymentType: "regular" as const,
  withholdingTax: "26.37",
  domesticTax: "0",
  quantity: "10",
  note: "",
};

describe("paymentFormSchema — Inlandszahlung", () => {
  it("akzeptiert gueltige Eingaben ohne Fremdwaehrung", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      isForeignCurrency: false,
      grossAmount: "100.00",
      netAmount: "73.63",
    });
    expect(result.success).toBe(true);
  });

  it("lehnt fehlenden Bruttobetrag ohne Fremdwaehrung ab", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      isForeignCurrency: false,
      grossAmount: "",
      netAmount: "73.63",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes("grossAmount")),
      ).toBe(true);
    }
  });

  it("lehnt ein Komma statt Punkt als Dezimaltrennzeichen ab", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      isForeignCurrency: false,
      grossAmount: "100,00",
      netAmount: "73.63",
    });
    expect(result.success).toBe(false);
  });

  it("lehnt ein leeres Depot ab", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      depotId: "",
      isForeignCurrency: false,
      grossAmount: "100.00",
      netAmount: "73.63",
    });
    expect(result.success).toBe(false);
  });
});

describe("paymentFormSchema — Fremdwaehrungszahlung", () => {
  it("akzeptiert gueltige Fremdwaehrungseingaben", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      isForeignCurrency: true,
      originalCurrency: "USD",
      originalGross: "120.00",
      originalNet: "88.00",
      fxRate: "0.92",
    });
    expect(result.success).toBe(true);
  });

  it("lehnt fehlenden Wechselkurs bei Fremdwaehrung ab", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      isForeignCurrency: true,
      originalCurrency: "USD",
      originalGross: "120.00",
      originalNet: "88.00",
      fxRate: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("fxRate"))).toBe(
        true,
      );
    }
  });

  it("lehnt einen ungueltigen Waehrungscode ab", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      isForeignCurrency: true,
      originalCurrency: "US",
      originalGross: "120.00",
      originalNet: "88.00",
      fxRate: "0.92",
    });
    expect(result.success).toBe(false);
  });

  it("verlangt weder grossAmount noch netAmount bei Fremdwaehrung", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      isForeignCurrency: true,
      originalCurrency: "USD",
      originalGross: "120.00",
      originalNet: "88.00",
      fxRate: "0.92",
      grossAmount: "",
      netAmount: "",
    });
    expect(result.success).toBe(true);
  });
});
