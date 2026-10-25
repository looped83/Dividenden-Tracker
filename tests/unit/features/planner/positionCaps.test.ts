import { describe, expect, it } from "vitest";
import { parsePositionCaps, toStoredPositionCaps } from "@/features/planner/positionCaps";

const ID = "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e5f";

describe("parsePositionCaps", () => {
  it("liest gültige Grenzen und lässt ungültige weg", () => {
    const caps = parsePositionCaps({
      [ID]: 12,
      "kein-uuid": 5,
      [ID.replace("6f", "7f")]: 0,
    });
    expect([...caps]).toEqual([[ID, 12]]);
  });

  it("liest alles andere als leer", () => {
    expect(parsePositionCaps(null).size).toBe(0);
    expect(parsePositionCaps([1, 2]).size).toBe(0);
  });

  it("liest eine Gewichtung mit Nachkommastelle", () => {
    expect(parsePositionCaps({ [ID]: 1.5 }).get(ID)).toBe(1.5);
    expect(parsePositionCaps({ [ID]: 0.4 }).size).toBe(0);
  });

  it("speichert leer als null und übersteht den Rundweg", () => {
    expect(toStoredPositionCaps(new Map())).toBeNull();
    const stored = toStoredPositionCaps(new Map([[ID, 20]]));
    expect(parsePositionCaps(stored).get(ID)).toBe(20);
  });
});
