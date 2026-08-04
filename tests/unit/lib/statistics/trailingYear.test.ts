import { describe, expect, it } from "vitest";
import { isInRange, trailingYearRange } from "@/lib/statistics";

/**
 * Das Zwoelfmonatsfenster, das an einem beliebigen Tag endet.
 *
 * Es traegt den Soll-Ist-Vergleich im Entwicklungsbereich: Die erwartete
 * Jahresdividende gilt fuer zwoelf Monate nach vorn, ihr Gegenstueck sind die
 * zwoelf Monate, die am Stichtag enden. Beide Zeitraeume muessen exakt gleich
 * lang sein, sonst vergleicht man Ungleiches.
 */
describe("trailingYearRange", () => {
  it("endet am Stichtag und beginnt am Tag nach dem Vorjahrestag", () => {
    // Nicht der 03.08.2025 — sonst umfasste das Fenster 366 Tage.
    expect(trailingYearRange("2026-08-03")).toEqual({
      start: "2025-08-04",
      end: "2026-08-03",
    });
  });

  it("schliesst den Stichtag selbst ein", () => {
    const range = trailingYearRange("2026-08-03");
    expect(isInRange("2026-08-03", range)).toBe(true);
    expect(isInRange("2025-08-04", range)).toBe(true);
    expect(isInRange("2025-08-03", range)).toBe(false);
    expect(isInRange("2026-08-04", range)).toBe(false);
  });

  it("rollt am Monatsende auf den Monatsersten weiter", () => {
    // Der 31.01.2025 hat keinen „Tag danach" im selben Monat.
    expect(trailingYearRange("2026-01-31")).toEqual({
      start: "2025-02-01",
      end: "2026-01-31",
    });
  });

  it("kommt mit dem Jahreswechsel zurecht", () => {
    expect(trailingYearRange("2026-12-31")).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
  });

  it("nimmt einen überspannten 29. Februar mit", () => {
    // Ein Jahr, das den 29.02. enthaelt, hat 366 Tage — das Fenster also auch.
    // Es wegzulassen hiesse, einen echten Zahltag zu unterschlagen.
    expect(trailingYearRange("2025-02-28")).toEqual({
      start: "2024-02-29",
      end: "2025-02-28",
    });
  });

  it("beginnt am 1. März, wenn es den Vorjahrestag nicht gibt", () => {
    // Zum 29.02.2024 gaebe es den 29.02.2023 nicht.
    expect(trailingYearRange("2024-02-29")).toEqual({
      start: "2023-03-01",
      end: "2024-02-29",
    });
  });
});
