import { describe, expect, it } from "vitest";
import { easeOut, formatFigure, parseFigure, type Figure } from "@/lib/utils/countUp";
import { formatMoney, Money, toCurrencyCode } from "@/lib/money";

function figure(text: string): Figure {
  const parsed = parseFigure(text);
  if (!parsed) throw new Error(`Keine Zahl in ${text}`);
  return parsed;
}

describe("parseFigure / formatFigure", () => {
  it("zählt Beträge im Format der Endzahl, mit Tausenderpunkt und Währung", () => {
    const text = formatMoney(Money.fromString("11293.36", toCurrencyCode("EUR")));
    const amount = figure(text);
    expect(amount.value).toBe(11293.36);
    expect(formatFigure(amount, 11293.36)).toBe(text);
    expect(formatFigure(amount, 0)).toBe(text.replace("11.293,36", "0,00"));
    expect(formatFigure(amount, 1234.5)).toBe(text.replace("11.293,36", "1.234,50"));
  });

  it("behält Vorzeichen, Prozent und Text um die Zahl", () => {
    expect(formatFigure(figure("+87,5 %"), 12.25)).toBe("+12,3 %");
    expect(formatFigure(figure("28/31 gedeckt"), 7.4)).toBe("7/31 gedeckt");
    const negative = figure("−1.200,00 €");
    expect(negative.value).toBe(-1200);
    expect(formatFigure(negative, -600)).toBe("−600,00 €");
  });

  it("schreibt Jahreszahlen ohne Punkt, wenn die Endzahl keinen hat", () => {
    expect(formatFigure(figure("2026"), 1013)).toBe("1013");
  });

  it("zeigt kein „-0,00“", () => {
    expect(formatFigure(figure("-5,00 €"), -0.001)).toBe("0,00 €");
  });

  it("findet keine Zahl in reinem Text", () => {
    expect(parseFigure("—")).toBeNull();
  });
});

describe("easeOut", () => {
  it("beginnt bei 0, endet bei 1 und bremst zum Ende", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});
