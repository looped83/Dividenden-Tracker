import { describe, expect, it } from "vitest";
import {
  normalizeGermanDecimalInput,
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
