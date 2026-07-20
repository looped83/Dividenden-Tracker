import { describe, expect, it } from "vitest";
import {
  isoDate,
  lastDayOfMonth,
  monthToDateRange,
  priorYearMonthToDateRange,
  priorYearSameDay,
  refDateFromDate,
  yearRange,
  ytdRange,
  type RefDate,
} from "@/lib/statistics/dates";

describe("dates", () => {
  it("bildet ISO-Datum mit Zero-Padding", () => {
    expect(isoDate(2026, 7, 5)).toBe("2026-07-05");
    expect(isoDate(2026, 12, 31)).toBe("2026-12-31");
  });

  it("kennt Schaltjahre bei lastDayOfMonth", () => {
    expect(lastDayOfMonth(2024, 2)).toBe(29); // Schaltjahr
    expect(lastDayOfMonth(2025, 2)).toBe(28); // kein Schaltjahr
    expect(lastDayOfMonth(2026, 7)).toBe(31);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
  });

  it("bildet 29.02. im Nicht-Schaltjahr auf 28.02. ab (priorYearSameDay)", () => {
    // 29.02.2024 (Schaltjahr) -> Vorjahr 2023 hat nur 28 Tage im Februar.
    const ref: RefDate = { year: 2024, month: 2, day: 29 };
    expect(priorYearSameDay(ref)).toBe("2023-02-28");
  });

  it("belaesst gueltige Tage bei priorYearSameDay", () => {
    expect(priorYearSameDay({ year: 2026, month: 7, day: 20 })).toBe("2025-07-20");
  });

  it("liefert YTD fuer laufendes und volles Jahr fuer abgeschlossenes Jahr", () => {
    const ref: RefDate = { year: 2026, month: 7, day: 20 };
    expect(ytdRange(2026, ref)).toEqual({ start: "2026-01-01", end: "2026-07-20" });
    expect(ytdRange(2024, ref)).toEqual({ start: "2024-01-01", end: "2024-12-31" });
  });

  it("liefert vollen Jahresbereich", () => {
    expect(yearRange(2025)).toEqual({ start: "2025-01-01", end: "2025-12-31" });
  });

  it("bildet Monatszeitraeume bis heute und im Vorjahr", () => {
    const ref: RefDate = { year: 2026, month: 7, day: 20 };
    expect(monthToDateRange(ref)).toEqual({ start: "2026-07-01", end: "2026-07-20" });
    expect(priorYearMonthToDateRange(ref)).toEqual({
      start: "2025-07-01",
      end: "2025-07-20",
    });
  });

  it("kappt den Monatsvergleich bei kuerzerem Vorjahresmonat", () => {
    // 29.02.2024 -> Vorjahr Februar 2023 endet am 28.
    const ref: RefDate = { year: 2024, month: 2, day: 29 };
    expect(priorYearMonthToDateRange(ref)).toEqual({
      start: "2023-02-01",
      end: "2023-02-28",
    });
  });

  it("refDateFromDate liefert 1-basierten Monat", () => {
    const ref = refDateFromDate(new Date(2026, 6, 20)); // Juli = Monatsindex 6
    expect(ref).toEqual({ year: 2026, month: 7, day: 20 });
  });
});
