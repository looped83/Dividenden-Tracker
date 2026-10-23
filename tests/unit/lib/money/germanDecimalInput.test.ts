import { describe, expect, it } from "vitest";
import {
  applyAmountInput,
  normalizeGermanDecimalInput,
  toGermanAmountInput,
  toGermanDecimalString,
} from "@/lib/money/germanDecimalInput";

describe("normalizeGermanDecimalInput", () => {
  it("wandelt ein Komma in einen Punkt um", () => {
    expect(normalizeGermanDecimalInput("73,63")).toBe("73.63");
  });

  it("entfernt Punkte als Tausendertrennzeichen vor dem Komma", () => {
    expect(normalizeGermanDecimalInput("1.234,56")).toBe("1234.56");
  });

  it("laesst kanonische Punkt-Eingaben ohne Komma unveraendert", () => {
    expect(normalizeGermanDecimalInput("73.63")).toBe("73.63");
  });

  it("trimmt umgebende Leerzeichen", () => {
    expect(normalizeGermanDecimalInput("  73,63  ")).toBe("73.63");
  });

  it("gibt eine leere Eingabe unveraendert zurueck", () => {
    expect(normalizeGermanDecimalInput("")).toBe("");
  });
});

describe("toGermanDecimalString", () => {
  it("wandelt einen kanonischen Punkt in ein Komma um", () => {
    expect(toGermanDecimalString("73.63")).toBe("73,63");
  });

  it("laesst Ganzzahlen ohne Trennzeichen unveraendert", () => {
    expect(toGermanDecimalString("73")).toBe("73");
  });
});

describe("normalizeGermanDecimalInput mit Tausenderpunkt ohne Komma", () => {
  it("liest „1.500“ als Tausend fuenfhundert", () => {
    expect(normalizeGermanDecimalInput("1.500")).toBe("1500");
    expect(normalizeGermanDecimalInput("12.345.678")).toBe("12345678");
  });
});

describe("toGermanAmountInput", () => {
  it("setzt Tausenderpunkte und das Komma", () => {
    expect(toGermanAmountInput("1500.00")).toBe("1.500,00");
    expect(toGermanAmountInput("1234567")).toBe("1.234.567");
    expect(toGermanAmountInput("73.63")).toBe("73,63");
  });
});

describe("applyAmountInput", () => {
  /** Tippt `char` an der Marke `|` in `field` und liefert Wert mit Marke. */
  function type(field: string, char: string): string {
    const at = field.indexOf("|");
    const raw = field.slice(0, at) + char + field.slice(at + 1);
    const next = applyAmountInput(raw, at + char.length, char);
    return `${next.value.slice(0, next.caret)}|${next.value.slice(next.caret)}`;
  }
  function backspace(field: string): string {
    const at = field.indexOf("|");
    const raw = field.slice(0, at - 1) + field.slice(at + 1);
    const next = applyAmountInput(raw, at - 1, null);
    return `${next.value.slice(0, next.caret)}|${next.value.slice(next.caret)}`;
  }

  it("setzt beim Tippen Tausenderpunkte", () => {
    expect(type("150|", "0")).toBe("1.500|");
    expect(type("99.999|", "9")).toBe("999.999|");
    expect(type("999.999|", "9")).toBe("9.999.999|");
  });

  it("haelt die Marke hinter derselben Ziffer", () => {
    expect(type("1|50", "5")).toBe("1.5|50");
    expect(type("|500", "1")).toBe("1|.500");
  });

  it("macht aus einem getippten Punkt das Komma", () => {
    expect(type("12|", ".")).toBe("12,|");
    expect(type("1.500|", ".")).toBe("1.500,|");
  });

  it("ignoriert ein zweites Komma", () => {
    expect(type("1,5|", ",")).toBe("1,5|");
  });

  it("begrenzt die Nachkommastellen", () => {
    expect(type("1,55|", "7")).toBe("1,55|");
  });

  it("ergaenzt die Null vor dem Komma und entfernt fuehrende Nullen", () => {
    expect(type("|", ",")).toBe("0,|");
    expect(type("0|", "5")).toBe("5|");
  });

  it("loescht Ziffern und gruppiert neu", () => {
    expect(backspace("1.500|")).toBe("150|");
    expect(backspace("1.234.5|67")).toBe("123.4|67");
  });

  it("liest eingefuegten Text mit Punkt ohne Dreiergruppen als Dezimalzahl", () => {
    expect(applyAmountInput("12.50", 5, "12.50").value).toBe("12,50");
    expect(applyAmountInput("1.500", 5, "1.500").value).toBe("1.500");
    expect(applyAmountInput("1500,00", 7, "1500,00").value).toBe("1.500,00");
  });

  it("verwirft Buchstaben und leert ein leeres Feld", () => {
    expect(applyAmountInput("12a", 3, "a").value).toBe("12");
    expect(applyAmountInput("", 0, null)).toEqual({ value: "", caret: 0 });
  });
});
