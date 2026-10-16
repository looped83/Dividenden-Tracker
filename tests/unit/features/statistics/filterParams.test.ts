import { describe, expect, it } from "vitest";
import {
  applyStatisticsFilter,
  parseStatisticsFilter,
  EMPTY_STATISTICS_FILTER,
} from "@/features/statistics/filterParams";
import type { StatisticsFilter } from "@/lib/statistics";

const CURRENT_YEAR = new Date().getFullYear();

describe("parseStatisticsFilter (§11)", () => {
  it("liefert leeren Filter für leere Parameter", () => {
    expect(parseStatisticsFilter(new URLSearchParams())).toEqual(EMPTY_STATISTICS_FILTER);
  });

  it("parst gültige, kombinierte Kriterien", () => {
    const params = new URLSearchParams({
      year: "2025",
      security: "sec-1",
      depot: "dep-1",
    });
    expect(parseStatisticsFilter(params)).toEqual<StatisticsFilter>({
      year: 2025,
      securityId: "sec-1",
      depotId: "dep-1",
    });
  });

  it("verwirft ungültige Jahre", () => {
    const filter = parseStatisticsFilter(new URLSearchParams({ year: "1800" }));
    expect(filter.year).toBeNull();
  });

  it("ignoriert abgelegte Kriterien aus alten Adressen", () => {
    // Quelle und Zahlungsart gab es hier einmal. Ein Lesezeichen von damals
    // darf nicht unsichtbar weiterfiltern — es bleibt schlicht wirkungslos.
    const params = new URLSearchParams({ source: "csv_import", type: "special" });
    expect(parseStatisticsFilter(params)).toEqual(EMPTY_STATISTICS_FILTER);
  });

  it("verwirft Jahre in der Zukunft", () => {
    const params = new URLSearchParams({ year: String(CURRENT_YEAR + 1) });
    expect(parseStatisticsFilter(params).year).toBeNull();
  });
});

describe("applyStatisticsFilter (§11)", () => {
  it("schreibt nur gesetzte Kriterien und entfernt null-Werte", () => {
    const filter: StatisticsFilter = {
      year: 2025,
      securityId: "sec-1",
      depotId: null,
    };
    const params = applyStatisticsFilter(new URLSearchParams(), filter);
    expect(params.get("year")).toBe("2025");
    expect(params.get("security")).toBe("sec-1");
    expect(params.has("depot")).toBe(false);
  });

  it("ist mit parseStatisticsFilter round-trip-stabil", () => {
    const filter: StatisticsFilter = {
      year: 2024,
      securityId: "abc",
      depotId: "xyz",
    };
    const params = applyStatisticsFilter(new URLSearchParams(), filter);
    expect(parseStatisticsFilter(params)).toEqual(filter);
  });

  it("bleibt nach Reload erhalten (Serialisierung → String → Parsing)", () => {
    const filter: StatisticsFilter = {
      year: 2023,
      securityId: null,
      depotId: "dep-9",
    };
    const serialized = applyStatisticsFilter(new URLSearchParams(), filter).toString();
    const reparsed = parseStatisticsFilter(new URLSearchParams(serialized));
    expect(reparsed).toEqual(filter);
  });

  it("lässt fremde Parameter unangetastet", () => {
    const params = new URLSearchParams({ tab: "jahre", foo: "bar" });
    const next = applyStatisticsFilter(params, {
      ...EMPTY_STATISTICS_FILTER,
      year: 2025,
    });
    expect(next.get("tab")).toBe("jahre");
    expect(next.get("foo")).toBe("bar");
    expect(next.get("year")).toBe("2025");
  });
});
