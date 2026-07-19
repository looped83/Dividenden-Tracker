import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatPercent,
  Money,
  MoneyDecimal,
  toCurrencyCode,
} from "@/lib/money";

const EUR = toCurrencyCode("EUR");

// Das Leerzeichen zwischen Zahl und Waehrungssymbol variiert je nach
// ICU-Version zwischen U+0020, U+00A0 und U+202F — die Tests pruefen daher
// die Ziffern-/Kommaformatierung, nicht das exakte Leerzeichen-Glyph.
describe("formatMoney — R-5 Anzeige bereits gerundeter Werte", () => {
  it("formatiert positive Betraege im de-DE-Format", () => {
    expect(formatMoney(Money.fromString("1234.5", EUR))).toMatch(/^1\.234,50\s€$/);
  });

  it("formatiert negative Betraege mit Minuszeichen", () => {
    expect(formatMoney(Money.fromString("-12.3", EUR))).toMatch(/^-12,30\s€$/);
  });

  it("formatiert 0 mit zwei Nachkommastellen", () => {
    expect(formatMoney(Money.zero(EUR))).toMatch(/^0,00\s€$/);
  });

  it("rundet nicht erneut — Money ist bereits exakt auf 2 Stellen normalisiert", () => {
    // Money.fromString rundet bereits bei der Erzeugung (R-1); formatMoney
    // veraendert den Wert nicht mehr.
    const money = Money.fromString("10.125", EUR); // -> 10.13 (R-1, HALF_UP)
    expect(money.toStringValue()).toBe("10.13");
    expect(formatMoney(money)).toMatch(/^10,13\s€$/);
  });
});

describe("formatPercent — R-4 Rundung erst zur Anzeige", () => {
  it("rundet kaufmaennisch auf die angegebene Nachkommastellenzahl", () => {
    expect(formatPercent(new MoneyDecimal("12.34"))).toMatch(/^12,3\s%$/);
    expect(formatPercent(new MoneyDecimal("12.35"))).toMatch(/^12,4\s%$/); // HALF_UP
    expect(formatPercent(new MoneyDecimal("-8.05"), 1)).toMatch(/^-8,1\s%$/);
  });

  it("unterstuetzt eine konfigurierbare Nachkommastellenzahl", () => {
    expect(formatPercent(new MoneyDecimal("12.3456"), 2)).toMatch(/^12,35\s%$/);
  });
});
