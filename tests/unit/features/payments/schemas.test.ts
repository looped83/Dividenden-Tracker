import { describe, expect, it } from "vitest";
import { paymentFormSchema } from "@/features/payments/schemas";

const baseValues = {
  securityId: "00000000-0000-0000-0000-000000000001",
  depotId: "00000000-0000-0000-0000-000000000002",
  payDate: "2026-03-15",
};

describe("paymentFormSchema", () => {
  it("akzeptiert gueltige Eingaben", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      netAmount: "73.63",
    });
    expect(result.success).toBe(true);
  });

  it("lehnt fehlenden Nettobetrag ab", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      netAmount: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("netAmount"))).toBe(
        true,
      );
    }
  });

  it("lehnt ein Komma statt Punkt als Dezimaltrennzeichen ab", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      netAmount: "73,63",
    });
    expect(result.success).toBe(false);
  });

  it("lehnt ein leeres Depot ab", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      depotId: "",
      netAmount: "73.63",
    });
    expect(result.success).toBe(false);
  });

  it("lehnt ein leeres Unternehmen ab", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      securityId: "",
      netAmount: "73.63",
    });
    expect(result.success).toBe(false);
  });

  it("lehnt ein ungueltiges Datum ab", () => {
    const result = paymentFormSchema.safeParse({
      ...baseValues,
      payDate: "15.03.2026",
      netAmount: "73.63",
    });
    expect(result.success).toBe(false);
  });
});
