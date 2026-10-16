import { describe, expect, it } from "vitest";
import { EUR, Money, toCurrencyCode } from "@/lib/money";
import { groupByMonth, monthTotals, totalOrNull } from "@/features/payments/monthGroups";

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
