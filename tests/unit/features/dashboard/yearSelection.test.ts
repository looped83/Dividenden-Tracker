import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("folgt dem Jahreswechsel, auch wenn die App ueber Neujahr offen bleibt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 0, 2, 9, 0));
    expect(parseYearSelection(null)).toBe(2027);
    expect(parseYearSelection("2027")).toBe(2027);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serialisiert zurueck in den URL-Wert", () => {
    expect(serializeYearSelection("all")).toBe("all");
    expect(serializeYearSelection(2026)).toBe("2026");
  });
});
