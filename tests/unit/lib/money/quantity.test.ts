import { describe, expect, it } from "vitest";
import { InvalidQuantityError, Quantity } from "@/lib/money";

describe("Quantity", () => {
  it("akzeptiert Bruchteile (Sparplaene) mit bis zu 6 Nachkommastellen", () => {
    expect(Quantity.fromString("1.5").toStringValue()).toBe("1.500000");
    expect(Quantity.fromString("0.123456").toStringValue()).toBe("0.123456");
  });

  it("rundet auf 6 Nachkommastellen (R-1-analog)", () => {
    expect(Quantity.fromString("1.1234565").toStringValue()).toBe("1.123457");
  });

  it("lehnt 0 und negative Werte ab (DATA_MODEL.md CHECK quantity > 0)", () => {
    expect(() => Quantity.fromString("0")).toThrow(InvalidQuantityError);
    expect(() => Quantity.fromString("-1")).toThrow(InvalidQuantityError);
  });
});
