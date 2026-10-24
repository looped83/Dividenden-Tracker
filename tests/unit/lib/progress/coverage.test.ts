import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import { coverFixedCosts, type FixedCost } from "@/lib/progress";

const eur = (value: string) => Money.fromString(value, EUR);
const cost = (name: string, amount: string): FixedCost => ({ name, amount: eur(amount) });

const KOSTEN = [cost("Miete", "900"), cost("Handy", "30"), cost("Strom", "80")];

describe("coverFixedCosts", () => {
  it("deckt die günstigsten Positionen zuerst und rechnet den Rest anteilig an", () => {
    const result = coverFixedCosts(KOSTEN, eur("200"));

    expect(result.items.map((item) => [item.cost.name, item.status])).toEqual([
      ["Handy", "covered"],
      ["Strom", "covered"],
      ["Miete", "next"],
    ]);
    expect(result.covered).toBe(2);
    expect(result.next?.missing.toStringValue()).toBe("810.00");
    expect(result.next?.percent.toFixed(2)).toBe("10.00");
    expect(result.total.toStringValue()).toBe("1010.00");
    expect(result.share?.toFixed(1)).toBe("19.8");
  });

  it("lässt hinter der nächsten Position alles offen, auch wenn sie passen würde", () => {
    const result = coverFixedCosts([cost("A", "50"), cost("B", "60")], eur("40"));
    expect(result.items.map((item) => item.status)).toEqual(["next", "open"]);
    expect(result.items[1]?.missing.toStringValue()).toBe("60.00");
  });

  it("begrenzt den Anteil auf 100 %, wenn alles gedeckt ist", () => {
    const result = coverFixedCosts(KOSTEN, eur("5000"));
    expect(result.covered).toBe(3);
    expect(result.next).toBeNull();
    expect(result.share?.toFixed(0)).toBe("100");
  });

  it("kommt ohne Fixkosten und ohne Dividende aus", () => {
    expect(coverFixedCosts([], eur("100")).share).toBeNull();
    const leer = coverFixedCosts(KOSTEN, eur("0"));
    expect(leer.covered).toBe(0);
    expect(leer.next?.cost.name).toBe("Handy");
    expect(leer.share?.toFixed(0)).toBe("0");
  });
});
