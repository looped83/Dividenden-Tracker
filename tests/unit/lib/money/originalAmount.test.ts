import { describe, expect, it } from "vitest";
import { FxRate, OriginalAmount, toCurrencyCode } from "@/lib/money";

const EUR = toCurrencyCode("EUR");

describe("OriginalAmount", () => {
  it("erlaubt negative Werte (Korrekturbuchungen)", () => {
    expect(OriginalAmount.fromString("-12.50").toStringValue()).toBe("-12.500000");
  });

  it("rundet auf 6 Nachkommastellen", () => {
    expect(OriginalAmount.fromString("12.1234565").toStringValue()).toBe("12.123457");
  });

  describe("convertToBaseCurrency — R-2 Waehrungsumrechnung", () => {
    it("berechnet Betrag_Basis = Betrag_Original × fx_rate und rundet auf 2 Stellen (R-1)", () => {
      const original = OriginalAmount.fromString("100.00"); // 100 USD
      const rate = FxRate.fromString("0.92"); // 0,92 EUR je USD
      const converted = original.convertToBaseCurrency(rate, EUR);
      expect(converted.toStringValue()).toBe("92.00");
      expect(converted.currency).toBe(EUR);
    });

    it("rundet das Umrechnungsergebnis kaufmaennisch (HALF_UP)", () => {
      const original = OriginalAmount.fromString("10");
      const rate = FxRate.fromString("0.925"); // 10 * 0.925 = 9.25 exakt an der Grenze
      expect(original.convertToBaseCurrency(rate, EUR).toStringValue()).toBe("9.25");

      const originalB = OriginalAmount.fromString("1");
      const rateB = FxRate.fromString("1.005"); // 1 * 1.005 = 1.005 -> HALF_UP auf 1.01
      expect(originalB.convertToBaseCurrency(rateB, EUR).toStringValue()).toBe("1.01");
    });
  });
});
