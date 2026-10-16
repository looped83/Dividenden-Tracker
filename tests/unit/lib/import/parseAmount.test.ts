import { describe, expect, it } from "vitest";
import { parseAmount } from "@/lib/import/parseAmount";

function value(raw: string | number, format: "de" | "en" | "auto" = "auto"): string {
  const out = parseAmount(raw, format);
  if (!out.ok) throw new Error(out.error.reason);
  return out.value.canonical;
}

describe("parseAmount", () => {
  it("parst deutsche Betraege", () => {
    expect(value("1.234,56", "de")).toBe("1234.56");
    expect(value("6,90", "de")).toBe("6.90");
    expect(value("49.391,57", "de")).toBe("49391.57");
  });

  it("parst englische Betraege", () => {
    expect(value("1,234.56", "en")).toBe("1234.56");
    expect(value("6.90", "en")).toBe("6.90");
  });

  it("nimmt Zahlen (exceljs) verlustfrei entgegen", () => {
    expect(value(4.76)).toBe("4.76");
    expect(value(7.84)).toBe("7.84");
  });

  it("erkennt gemischte Formate am letzten Trennzeichen", () => {
    expect(value("1.234,56")).toBe("1234.56");
    expect(value("1,234.56")).toBe("1234.56");
  });

  it("behandelt negative Betraege (Minus und Klammern)", () => {
    expect(value("-12,34", "de")).toBe("-12.34");
    expect(value("(12,34)", "de")).toBe("-12.34");
    expect(value("−12,34", "de")).toBe("-12.34");
  });

  it("entfernt Waehrungssymbole", () => {
    expect(value("€ 1.234,56", "de")).toBe("1234.56");
    expect(value("1.234,56 €", "de")).toBe("1234.56");
  });

  it("meldet mehrdeutige Einzelkomma-/Punktwerte im auto-Modus", () => {
    const out = parseAmount("1,234", "auto");
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error.ambiguous).toBe(true);
  });

  it("loest 1,234 je nach Format eindeutig auf", () => {
    expect(value("1,234", "de")).toBe("1.234"); // deutsche Dezimalzahl
    expect(value("1,234", "en")).toBe("1234"); // englischer Tausender
  });

  it("lehnt Muell ab", () => {
    expect(parseAmount("abc", "de").ok).toBe(false);
    expect(parseAmount("", "de").ok).toBe(false);
  });
});
