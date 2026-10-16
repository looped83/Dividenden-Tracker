import { describe, expect, it } from "vitest";
import { InvalidCurrencyCodeError, toCurrencyCode } from "@/lib/money";

describe("toCurrencyCode", () => {
  it("akzeptiert gueltige 3-Buchstaben-Codes und normalisiert Grossschreibung", () => {
    expect(toCurrencyCode("EUR")).toBe("EUR");
    expect(toCurrencyCode("usd")).toBe("USD");
    expect(toCurrencyCode(" chf ")).toBe("CHF");
  });

  it("lehnt ungueltige Codes ab", () => {
    expect(() => toCurrencyCode("EU")).toThrow(InvalidCurrencyCodeError);
    expect(() => toCurrencyCode("EURO")).toThrow(InvalidCurrencyCodeError);
    expect(() => toCurrencyCode("123")).toThrow(InvalidCurrencyCodeError);
    expect(() => toCurrencyCode("")).toThrow(InvalidCurrencyCodeError);
  });
});
