import { describe, expect, it } from "vitest";
import { Money, toCurrencyCode } from "@/lib/money";
import { checkNetAmountInvariance } from "@/lib/payments/invariant";

const EUR = toCurrencyCode("EUR");
const money = (value: string) => Money.fromString(value, EUR);

describe("checkNetAmountInvariance — spiegelt DB-CHECK net_amount_invariance", () => {
  it("ist innerhalb der Toleranz bei exakter Uebereinstimmung", () => {
    const result = checkNetAmountInvariance({
      grossAmount: money("100.00"),
      netAmount: money("73.63"),
      withholdingTax: money("26.37"),
      domesticTax: money("0"),
    });
    expect(result.withinTolerance).toBe(true);
    expect(result.difference.isZero()).toBe(true);
  });

  it("akzeptiert eine Abweichung genau an der Toleranzgrenze (0.02)", () => {
    const result = checkNetAmountInvariance({
      grossAmount: money("100.00"),
      netAmount: money("73.65"), // erwartet waeren 73.63 -> Differenz -0.02
      withholdingTax: money("26.37"),
      domesticTax: money("0"),
    });
    expect(result.withinTolerance).toBe(true);
  });

  it("lehnt eine Abweichung knapp ausserhalb der Toleranz ab (0.03)", () => {
    const result = checkNetAmountInvariance({
      grossAmount: money("100.00"),
      netAmount: money("73.66"),
      withholdingTax: money("26.37"),
      domesticTax: money("0"),
    });
    expect(result.withinTolerance).toBe(false);
    expect(result.difference.toStringValue()).toBe("-0.03");
  });

  it("berücksichtigt Solidaritätszuschlag, Kirchensteuer und Gebühren", () => {
    const result = checkNetAmountInvariance({
      grossAmount: money("100.00"),
      netAmount: money("70.00"),
      withholdingTax: money("20.00"),
      domesticTax: money("0"),
      solidaritySurcharge: money("5.00"),
      churchTax: money("3.00"),
      fees: money("2.00"),
    });
    expect(result.withinTolerance).toBe(true);
    expect(result.difference.isZero()).toBe(true);
  });

  it("behandelt fehlende optionale Felder als 0", () => {
    const withOptional = checkNetAmountInvariance({
      grossAmount: money("100.00"),
      netAmount: money("100.00"),
      withholdingTax: money("0"),
      domesticTax: money("0"),
      solidaritySurcharge: money("0"),
      churchTax: money("0"),
      fees: money("0"),
    });
    const withoutOptional = checkNetAmountInvariance({
      grossAmount: money("100.00"),
      netAmount: money("100.00"),
      withholdingTax: money("0"),
      domesticTax: money("0"),
    });
    expect(withOptional.difference.equals(withoutOptional.difference)).toBe(true);
  });

  it("erkennt eine positive Abweichung (zu wenig Netto abgezogen)", () => {
    const result = checkNetAmountInvariance({
      grossAmount: money("100.00"),
      netAmount: money("50.00"),
      withholdingTax: money("20.00"),
      domesticTax: money("0"),
    });
    expect(result.withinTolerance).toBe(false);
    expect(result.difference.toStringValue()).toBe("30.00");
    expect(result.difference.isPositive()).toBe(true);
  });
});
