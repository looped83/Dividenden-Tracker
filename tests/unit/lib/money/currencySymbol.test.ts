import { describe, expect, it } from "vitest";
import { currencySymbol } from "@/lib/money";

describe("currencySymbol", () => {
  it("liefert das Zeichen gaengiger Waehrungen", () => {
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("GBP")).toBe("£");
  });

  it("faellt auf den Code zurueck, wo es kein Zeichen gibt", () => {
    // Fuer CHF kennt de-DE kein eigenes Zeichen — dann steht der Code da,
    // erfunden wird nichts.
    expect(currencySymbol("CHF")).toBe("CHF");
  });
});
