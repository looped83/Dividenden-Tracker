import { describe, expect, it } from "vitest";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";

describe("formatCountNumber", () => {
  it("setzt den Tausenderpunkt ab vier Stellen", () => {
    expect(formatCountNumber(999)).toBe("999");
    expect(formatCountNumber(1000)).toBe("1.000");
    expect(formatCountNumber(1439)).toBe("1.439");
    expect(formatCountNumber(1234567)).toBe("1.234.567");
  });

  it("zeigt keine Nachkommastellen", () => {
    expect(formatCountNumber(0)).toBe("0");
    expect(formatCountNumber(12.4)).toBe("12");
  });

  it("behaelt das Vorzeichen", () => {
    expect(formatCountNumber(-1500)).toBe("-1.500");
  });
});

describe("formatCountNoun", () => {
  it("waehlt Singular und Plural", () => {
    expect(formatCountNoun(1, "Zahlung", "Zahlungen")).toBe("1 Zahlung");
    expect(formatCountNoun(0, "Zahlung", "Zahlungen")).toBe("0 Zahlungen");
    expect(formatCountNoun(1439, "Zahlung", "Zahlungen")).toBe("1.439 Zahlungen");
  });
});
