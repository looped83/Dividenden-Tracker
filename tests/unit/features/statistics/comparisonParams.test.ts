import { describe, expect, it } from "vitest";
import type { RefDate } from "@/lib/statistics";
import {
  applyComparisonSelection,
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
    expect(parse("")).toEqual({ mode: "jahre", currentYear: 2026, referenceYear: 2025 });
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
});

describe("applyComparisonSelection", () => {
  it("schreibt Modus und Jahre und laesst fremde Parameter stehen", () => {
    const params = applyComparisonSelection(new URLSearchParams("security=sec-a"), {
      mode: "jahre",
      currentYear: 2025,
      referenceYear: 2023,
    });
    expect(params.get("security")).toBe("sec-a");
    expect(params.get("basis")).toBe("2025");
    expect(params.get("referenz")).toBe("2023");
    expect(params.get("modus")).toBeNull();
  });

  it("entfernt die Jahre im rollierenden Modus", () => {
    // Sie wirken dort nicht — eine Adresse soll nur tragen, was auch greift.
    const params = applyComparisonSelection(new URLSearchParams("basis=2025"), {
      mode: "rollierend",
      currentYear: 2025,
      referenceYear: 2024,
    });
    expect(params.get("modus")).toBe("rollierend");
    expect(params.get("basis")).toBeNull();
  });

  it("ist mit sich selbst wiedereinlesbar", () => {
    const selection = { mode: "jahre", currentYear: 2024, referenceYear: 2026 } as const;
    const params = applyComparisonSelection(new URLSearchParams(), selection);
    expect(parseComparisonSelection(params, OPTIONS, TODAY)).toEqual(selection);
  });
});
