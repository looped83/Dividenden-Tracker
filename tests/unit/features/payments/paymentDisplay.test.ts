import { describe, expect, it } from "vitest";
import { amountDiffers } from "@/features/payments/paymentDisplay";

describe("amountDiffers", () => {
  it("vergleicht den Wert, nicht die Schreibweise", () => {
    // Import haelt "12.50" fest, PostgREST liefert 12.5.
    expect(amountDiffers("12.50", "12.5")).toBe(false);
    expect(amountDiffers("100.00", "100")).toBe(false);
  });

  it("erkennt eine echte Aenderung", () => {
    expect(amountDiffers("12.50", "12.49")).toBe(true);
  });

  it("rundet einen ungerundeten Ursprungswert wie beim Speichern (R-1)", () => {
    expect(amountDiffers("12.3456", "12.35")).toBe(false);
  });

  it("meldet bei unlesbarem Ursprungswert einen Unterschied", () => {
    expect(amountDiffers("abc", "12.50")).toBe(true);
  });
});
