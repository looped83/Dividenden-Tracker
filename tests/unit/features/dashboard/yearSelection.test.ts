import { describe, expect, it } from "vitest";
import {
  parseYearSelection,
  serializeYearSelection,
} from "@/features/dashboard/yearParam";

const CURRENT_YEAR = new Date().getFullYear();

describe("parseYearSelection (§3 URL-Zustand)", () => {
  it("erkennt 'all'", () => {
    expect(parseYearSelection("all")).toBe("all");
  });

  it("akzeptiert gueltige Jahre im Bereich", () => {
    expect(parseYearSelection("2014")).toBe(2014);
    expect(parseYearSelection(String(CURRENT_YEAR))).toBe(CURRENT_YEAR);
  });

  it("faellt bei ungueltigen Parametern sicher auf das aktuelle Jahr zurueck", () => {
    expect(parseYearSelection(null)).toBe(CURRENT_YEAR);
    expect(parseYearSelection("")).toBe(CURRENT_YEAR);
    expect(parseYearSelection("abc")).toBe(CURRENT_YEAR);
    expect(parseYearSelection("1969")).toBe(CURRENT_YEAR); // vor pay_date-Grenze
    expect(parseYearSelection(String(CURRENT_YEAR + 5))).toBe(CURRENT_YEAR); // Zukunft
    expect(parseYearSelection("20260")).toBe(CURRENT_YEAR); // keine 4 Ziffern
  });

  it("serialisiert zurueck in den URL-Wert", () => {
    expect(serializeYearSelection("all")).toBe("all");
    expect(serializeYearSelection(2026)).toBe("2026");
  });
});
