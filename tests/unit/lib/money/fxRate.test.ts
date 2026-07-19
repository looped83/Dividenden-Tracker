import { describe, expect, it } from "vitest";
import { FxRate, InvalidFxRateError } from "@/lib/money";

describe("FxRate", () => {
  it("speichert bis zu 8 Nachkommastellen", () => {
    expect(FxRate.fromString("0.92345678").toStringValue()).toBe("0.92345678");
  });

  it("lehnt 0 und negative Kurse ab (DATA_MODEL.md CHECK fx_rate > 0)", () => {
    expect(() => FxRate.fromString("0")).toThrow(InvalidFxRateError);
    expect(() => FxRate.fromString("-0.5")).toThrow(InvalidFxRateError);
  });
});
