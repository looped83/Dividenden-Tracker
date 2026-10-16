import { describe, expect, it } from "vitest";
import { deriveDataQuality } from "@/features/securities/dataQuality";

const complete = {
  ticker: "ABT",
  isin: "US0028241000",
  wkn: "850103",
  country: "US",
  sector: "Healthcare",
  currency: "USD",
};

describe("deriveDataQuality", () => {
  it("liefert 'ok', wenn alle Stammdaten gefuellt sind (Notiz zaehlt nicht)", () => {
    expect(deriveDataQuality(complete)).toBe("ok");
  });

  it("liefert 'incomplete', sobald ein Stammdatenfeld fehlt", () => {
    for (const key of [
      "ticker",
      "isin",
      "wkn",
      "country",
      "sector",
      "currency",
    ] as const) {
      expect(deriveDataQuality({ ...complete, [key]: null })).toBe("incomplete");
      expect(deriveDataQuality({ ...complete, [key]: "" })).toBe("incomplete");
      expect(deriveDataQuality({ ...complete, [key]: "   " })).toBe("incomplete");
    }
  });

  it("stuft ein importiertes, nur namentlich gefuehrtes Unternehmen als 'incomplete' ein", () => {
    expect(deriveDataQuality({})).toBe("incomplete");
  });

  it("stuft nach Ergaenzen aller Felder auf 'ok' hoch", () => {
    const incomplete = { ...complete, isin: null };
    expect(deriveDataQuality(incomplete)).toBe("incomplete");
    expect(deriveDataQuality({ ...incomplete, isin: "US0028241000" })).toBe("ok");
  });
});
