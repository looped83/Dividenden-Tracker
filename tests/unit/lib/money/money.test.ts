import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  Money,
  sumMoney,
  toCurrencyCode,
  InvalidDecimalStringError,
} from "@/lib/money";

const EUR = toCurrencyCode("EUR");
const USD = toCurrencyCode("USD");

describe("Money.fromString — R-1 kaufmaennische Rundung auf 2 Nachkommastellen", () => {
  it.each([
    ["10", "10.00"],
    ["10.1", "10.10"],
    ["10.125", "10.13"], // HALF_UP: 0,125 -> 0,13, nicht HALF_EVEN (0,12)
    ["10.115", "10.12"], // HALF_UP: 0,115 -> 0,12
    ["10.005", "10.01"], // klassischer Bankers-Rundungs-Unterschiedsfall
    ["-10.125", "-10.13"], // Vorzeichen bleibt erhalten, Betrag rundet weg von 0
    ["0", "0.00"],
    ["0.004", "0.00"],
    ["0.005", "0.01"],
  ])("rundet %s zu %s", (input, expected) => {
    expect(Money.fromString(input, EUR).toStringValue()).toBe(expected);
  });

  it("lehnt Kommaformat ab (kanonisches Format ist Punkt-getrennt)", () => {
    expect(() => Money.fromString("10,50", EUR)).toThrow(InvalidDecimalStringError);
  });

  it("lehnt mehrere Punkte (Tausendertrennzeichen-Notation) ab", () => {
    expect(() => Money.fromString("1.234.567", EUR)).toThrow(InvalidDecimalStringError);
  });

  it("lehnt leere und nicht-numerische Strings ab", () => {
    expect(() => Money.fromString("", EUR)).toThrow(InvalidDecimalStringError);
    expect(() => Money.fromString("abc", EUR)).toThrow(InvalidDecimalStringError);
    expect(() => Money.fromString("12.34.56", EUR)).toThrow(InvalidDecimalStringError);
  });
});

describe("Money Arithmetik", () => {
  it("addiert und subtrahiert exakt ohne Float-Drift", () => {
    // Klassischer Float-Fehlerfall: 0.1 + 0.2 !== 0.3 in IEEE-754.
    const a = Money.fromString("0.10", EUR);
    const b = Money.fromString("0.20", EUR);
    expect(a.add(b).toStringValue()).toBe("0.30");
  });

  it("summiert viele kleine Betraege exakt (R-3)", () => {
    const amounts = Array.from({ length: 1000 }, () => Money.fromString("0.01", EUR));
    expect(sumMoney(amounts, EUR).toStringValue()).toBe("10.00");
  });

  it("negiert korrekt", () => {
    expect(Money.fromString("12.34", EUR).negate().toStringValue()).toBe("-12.34");
    expect(Money.fromString("-12.34", EUR).negate().toStringValue()).toBe("12.34");
  });

  it("verweigert Verrechnung unterschiedlicher Waehrungen", () => {
    const eur = Money.fromString("10.00", EUR);
    const usd = Money.fromString("10.00", USD);
    expect(() => eur.add(usd)).toThrow(CurrencyMismatchError);
    expect(() => eur.subtract(usd)).toThrow(CurrencyMismatchError);
    expect(() => eur.compareTo(usd)).toThrow(CurrencyMismatchError);
  });

  it("vergleicht Betraege korrekt", () => {
    const a = Money.fromString("10.00", EUR);
    const b = Money.fromString("20.00", EUR);
    expect(a.compareTo(b)).toBe(-1);
    expect(b.compareTo(a)).toBe(1);
    expect(a.compareTo(Money.fromString("10.00", EUR))).toBe(0);
  });

  it("erkennt Null-, Positiv- und Negativwerte (Nullwerte zaehlen nicht als negativ/positiv)", () => {
    const zero = Money.zero(EUR);
    expect(zero.isZero()).toBe(true);
    expect(zero.isNegative()).toBe(false);
    expect(zero.isPositive()).toBe(false);

    expect(Money.fromString("-0.01", EUR).isNegative()).toBe(true);
    expect(Money.fromString("0.01", EUR).isPositive()).toBe(true);
  });

  it("ist unveraenderlich (jede Operation liefert einen neuen Wert)", () => {
    const a = Money.fromString("10.00", EUR);
    const b = a.add(Money.fromString("5.00", EUR));
    expect(a.toStringValue()).toBe("10.00");
    expect(b.toStringValue()).toBe("15.00");
  });

  it("equals vergleicht Wert UND Waehrung", () => {
    const a = Money.fromString("10.00", EUR);
    const b = Money.fromString("10.00", EUR);
    const c = Money.fromString("10.00", USD);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe("sumMoney — leere Liste", () => {
  it("liefert 0 fuer eine leere Liste", () => {
    expect(sumMoney([], EUR).toStringValue()).toBe("0.00");
  });
});
