import { describe, expect, it } from "vitest";
import { formatCalendarDate, formatDayMonth } from "@/lib/utils/formatDate";

describe("formatDayMonth", () => {
  it("nennt Tag und Monat mit führender Null, ohne Jahr", () => {
    expect(formatDayMonth("2026-03-05")).toBe("05.03.");
    // Dieselbe Schreibweise wie das volle Datum, nur ohne Jahr.
    expect(
      formatCalendarDate("2026-03-05").startsWith(formatDayMonth("2026-03-05")),
    ).toBe(true);
  });

  it("gibt Unlesbares unverändert zurück", () => {
    expect(formatDayMonth("unbekannt")).toBe("unbekannt");
  });
});
