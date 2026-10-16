import { describe, expect, it } from "vitest";
import { InvalidDecimalStringError, parseCanonicalDecimal } from "@/lib/money";

describe("parseCanonicalDecimal", () => {
  it("parst ganze Zahlen, Dezimalzahlen und explizite Vorzeichen", () => {
    expect(parseCanonicalDecimal("42", "Test").toString()).toBe("42");
    expect(parseCanonicalDecimal("42.5", "Test").toString()).toBe("42.5");
    expect(parseCanonicalDecimal("+42.5", "Test").toString()).toBe("42.5");
    expect(parseCanonicalDecimal("-42.5", "Test").toString()).toBe("-42.5");
  });

  it("entfernt umgebende Leerzeichen", () => {
    expect(parseCanonicalDecimal("  42.5  ", "Test").toString()).toBe("42.5");
  });

  it("lehnt lokale Formate (Komma, Tausenderpunkte) ab — das ist Aufgabe von lib/parsing", () => {
    expect(() => parseCanonicalDecimal("1.234,56", "Test")).toThrow(
      InvalidDecimalStringError,
    );
    expect(() => parseCanonicalDecimal("1,234.56", "Test")).toThrow(
      InvalidDecimalStringError,
    );
  });

  it("lehnt leere Strings, reinen Text und mehrfache Punkte ab", () => {
    expect(() => parseCanonicalDecimal("", "Test")).toThrow(InvalidDecimalStringError);
    expect(() => parseCanonicalDecimal("abc", "Test")).toThrow(InvalidDecimalStringError);
    expect(() => parseCanonicalDecimal("1.2.3", "Test")).toThrow(
      InvalidDecimalStringError,
    );
  });

  it("die Fehlermeldung nennt Rohwert und Kontext", () => {
    try {
      parseCanonicalDecimal("nicht-numerisch", "Money");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDecimalStringError);
      expect((error as Error).message).toContain("nicht-numerisch");
      expect((error as Error).message).toContain("Money");
    }
  });
});
