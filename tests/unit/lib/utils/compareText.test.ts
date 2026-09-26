import { describe, expect, it } from "vitest";
import { compareGerman, compareGermanLoose } from "@/lib/utils/compareText";

describe("compareGerman", () => {
  it("sortiert Umlaute zu ihrem Grundbuchstaben, nicht hinter das z", () => {
    expect(["Zeta", "Öl", "Apfel", "Nord"].sort(compareGerman)).toEqual([
      "Apfel",
      "Nord",
      "Öl",
      "Zeta",
    ]);
  });

  it("entspricht localeCompare mit deutscher Sprachangabe", () => {
    const names = ["b", "B", "ä", "a", "A", "Ä"];
    expect([...names].sort(compareGerman)).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, "de")),
    );
  });
});

describe("compareGermanLoose", () => {
  it("wertet Gross-/Kleinschreibung und Akzente gleich", () => {
    expect(compareGermanLoose("apple", "Apple")).toBe(0);
    expect(compareGermanLoose("a", "ä")).toBe(0);
    expect(compareGermanLoose("a", "b")).toBeLessThan(0);
  });
});
