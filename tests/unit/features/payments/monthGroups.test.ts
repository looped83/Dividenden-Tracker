import { describe, expect, it } from "vitest";
import { EUR, Money, toCurrencyCode } from "@/lib/money";
import {
  groupByMonth,
  monthChanges,
  monthTotals,
  totalOrNull,
} from "@/features/payments/monthGroups";

const USD = toCurrencyCode("USD");

describe("groupByMonth", () => {
  it("fasst aufeinanderfolgende Zeilen eines Monats zusammen und behaelt die Reihenfolge", () => {
    const rows = ["2026-05-20", "2026-05-02", "2026-03-10", "2025-03-01"];
    const groups = groupByMonth(rows, (date) => date);
    expect(groups.map((group) => [group.key, group.rows.length])).toEqual([
      ["2026-05", 2],
      ["2026-03", 1],
      ["2025-03", 1],
    ]);
    expect(groups[0]).toMatchObject({ year: 2026, month: 5 });
  });

  it("liefert fuer keine Zeilen keine Gruppe", () => {
    expect(groupByMonth([], (date: string) => date)).toEqual([]);
  });
});

describe("totalOrNull", () => {
  it("addiert Betraege einer Waehrung", () => {
    const total = totalOrNull([
      Money.fromString("20.10", EUR),
      Money.fromString("0.40", EUR),
    ]);
    expect(total?.toStringValue()).toBe("20.50");
  });

  it("addiert nie ueber Waehrungen hinweg", () => {
    expect(
      totalOrNull([Money.fromString("20.00", EUR), Money.fromString("5.00", USD)]),
    ).toBeNull();
    expect(totalOrNull([])).toBeNull();
  });
});

describe("monthTotals", () => {
  it("summiert je Monat ueber alle Zeilen", () => {
    const rows = [
      { date: "2026-05-02", amount: "20.00" },
      { date: "2026-03-10", amount: "50.00" },
      { date: "2026-05-20", amount: "30.00" },
    ];
    const totals = monthTotals(
      rows,
      (row) => row.date,
      (row) => Money.fromString(row.amount, EUR),
    );
    expect(totals.get("2026-05")?.toStringValue()).toBe("50.00");
    expect(totals.get("2026-03")?.toStringValue()).toBe("50.00");
  });
});

describe("monthChanges", () => {
  const today = { year: 2026, month: 10, day: 15 };
  const rows = (items: [string, string][]) =>
    items.map(([date, amount]) => ({ date, amount: Money.fromString(amount, EUR) }));
  const run = (items: [string, string][]) =>
    monthChanges(
      rows(items),
      (row) => row.date,
      (row) => row.amount,
      today,
    );

  it("vergleicht die Monatssumme mit demselben Monat im Vorjahr", () => {
    const result = run([
      ["2025-09-03", "40.00"],
      ["2025-09-20", "60.00"],
      ["2026-09-10", "120.00"],
    ]);
    expect(result.get("2026-09")).toMatchObject({ direction: "up", cutoffDay: null });
    expect(result.get("2026-09")?.percent.toString()).toBe("20");
    expect(result.get("2026-09")?.reference.toStringValue()).toBe("100.00");
    expect(result.has("2025-09")).toBe(false);
  });

  it("kappt den laufenden Monat auf beiden Seiten an heute", () => {
    const result = run([
      ["2025-10-05", "50.00"],
      ["2025-10-28", "500.00"],
      ["2026-10-09", "40.00"],
    ]);
    expect(result.get("2026-10")).toMatchObject({ direction: "down", cutoffDay: 15 });
    expect(result.get("2026-10")?.reference.toStringValue()).toBe("50.00");
  });

  it("liefert nichts ohne Vorjahressumme oder bei gemischten Waehrungen", () => {
    const mixed = monthChanges(
      [
        { date: "2025-03-01", amount: Money.fromString("10.00", EUR) },
        { date: "2026-03-01", amount: Money.fromString("10.00", USD) },
      ],
      (row) => row.date,
      (row) => row.amount,
      today,
    );
    expect(mixed.size).toBe(0);
    expect(run([["2026-04-01", "10.00"]]).size).toBe(0);
  });
});
