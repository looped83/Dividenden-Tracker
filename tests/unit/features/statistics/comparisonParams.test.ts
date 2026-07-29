import { describe, expect, it } from "vitest";
import type { RefDate } from "@/lib/statistics";
import {
  applyComparisonSelection,
  comparisonMonthOptions,
  comparisonYearOptions,
  parseComparisonSelection,
} from "@/features/statistics/comparisonParams";

const TODAY: RefDate = { year: 2026, month: 7, day: 29 };
const OPTIONS = [2026, 2025, 2024];

function parse(query: string) {
  return parseComparisonSelection(new URLSearchParams(query), OPTIONS, TODAY);
}

describe("comparisonYearOptions", () => {
  it("ergaenzt das laufende Jahr und dessen Vorjahr", () => {
    // Ohne die Ergaenzung liesse sich ein gerade begonnenes Jahr nicht gegen
    // das Vorjahr stellen — der Fall, in dem der Vergleich am meisten sagt.
    expect(comparisonYearOptions([2024], TODAY)).toEqual([2026, 2025, 2024]);
  });

  it("dupliziert vorhandene Jahre nicht und sortiert absteigend", () => {
    // 2024 fehlt bewusst: In einem Jahr ohne Zahlungen gibt es nichts zu
    // vergleichen, ausser es ist das laufende oder dessen Vorjahr.
    expect(comparisonYearOptions([2025, 2026, 2023], TODAY)).toEqual([2026, 2025, 2023]);
  });
});

describe("parseComparisonSelection", () => {
  it("vergleicht ohne Parameter das juengste Jahr mit dem naechstaelteren", () => {
    expect(parse("")).toEqual({
      mode: "jahre",
      currentYear: 2026,
      referenceYear: 2025,
      month: 7,
    });
  });

  it("uebernimmt gueltige Jahre aus der Adresse", () => {
    expect(parse("basis=2025&referenz=2024")).toMatchObject({
      currentYear: 2025,
      referenceYear: 2024,
    });
  });

  it("verwirft nicht waehlbare Jahre still", () => {
    expect(parse("basis=1999&referenz=abc")).toMatchObject({
      currentYear: 2026,
      referenceYear: 2025,
    });
  });

  it("laesst kein Jahr gegen sich selbst antreten", () => {
    expect(parse("basis=2025&referenz=2025")).toMatchObject({
      currentYear: 2025,
      referenceYear: 2024,
    });
  });

  it("weicht auf das Kalendervorjahr aus, wenn es kein aelteres Jahr gibt", () => {
    const selection = parseComparisonSelection(
      new URLSearchParams("basis=2024"),
      [2024],
      TODAY,
    );
    expect(selection.referenceYear).toBe(2023);
  });

  it("erkennt den rollierenden Modus", () => {
    expect(parse("modus=rollierend").mode).toBe("rollierend");
  });

  it("faellt bei unbekanntem Modus auf den Jahresvergleich zurueck", () => {
    expect(parse("modus=quartal").mode).toBe("jahre");
  });

  it("erkennt den Monatsvergleich", () => {
    expect(parse("modus=monate&monat=3")).toMatchObject({
      mode: "monate",
      month: 3,
    });
  });

  it("nimmt als Vorgabe den laufenden Monat", () => {
    expect(parse("").month).toBe(7);
  });

  it("verwirft einen Monat, den es im gewaehlten Jahr noch nicht gibt", () => {
    // Dezember 2026 hat am 29.07.2026 noch nicht begonnen — „0 € gegen 280 €"
    // waere kein Rueckgang, sondern eine Falschaussage.
    expect(parse("modus=monate&basis=2026&monat=12").month).toBe(7);
  });

  it("erlaubt jeden Monat eines abgeschlossenen Jahres", () => {
    expect(parse("modus=monate&basis=2025&monat=12").month).toBe(12);
  });

  it("verwirft unsinnige Monatswerte", () => {
    expect(parse("modus=monate&monat=0").month).toBe(7);
    expect(parse("modus=monate&monat=13").month).toBe(7);
  });
});

describe("comparisonMonthOptions", () => {
  it("endet im laufenden Jahr beim laufenden Monat", () => {
    expect(comparisonMonthOptions(2026, TODAY)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("bietet in einem abgeschlossenen Jahr alle zwoelf Monate", () => {
    expect(comparisonMonthOptions(2025, TODAY)).toHaveLength(12);
  });
});

describe("applyComparisonSelection", () => {
  it("schreibt Modus und Jahre und laesst fremde Parameter stehen", () => {
    const params = applyComparisonSelection(new URLSearchParams("security=sec-a"), {
      mode: "jahre",
      currentYear: 2025,
      referenceYear: 2023,
      month: 7,
    });
    expect(params.get("security")).toBe("sec-a");
    expect(params.get("basis")).toBe("2025");
    expect(params.get("referenz")).toBe("2023");
    expect(params.get("modus")).toBeNull();
  });

  it("schreibt den Monat nur im Monatsvergleich", () => {
    const monat = applyComparisonSelection(new URLSearchParams(), {
      mode: "monate",
      currentYear: 2026,
      referenceYear: 2025,
      month: 3,
    });
    expect(monat.get("modus")).toBe("monate");
    expect(monat.get("monat")).toBe("3");

    const jahre = applyComparisonSelection(new URLSearchParams("monat=3"), {
      mode: "jahre",
      currentYear: 2026,
      referenceYear: 2025,
      month: 3,
    });
    expect(jahre.get("monat")).toBeNull();
  });

  it("entfernt die Jahre im rollierenden Modus", () => {
    // Sie wirken dort nicht — eine Adresse soll nur tragen, was auch greift.
    const params = applyComparisonSelection(new URLSearchParams("basis=2025"), {
      mode: "rollierend",
      currentYear: 2025,
      referenceYear: 2024,
      month: 7,
    });
    expect(params.get("modus")).toBe("rollierend");
    expect(params.get("basis")).toBeNull();
  });

  it("ist mit sich selbst wiedereinlesbar", () => {
    const selection = {
      mode: "jahre",
      currentYear: 2024,
      referenceYear: 2026,
      month: 7,
    } as const;
    const params = applyComparisonSelection(new URLSearchParams(), selection);
    expect(parseComparisonSelection(params, OPTIONS, TODAY)).toEqual(selection);
  });
});
