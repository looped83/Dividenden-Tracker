import { describe, expect, it } from "vitest";
import {
  InvalidPerShareAmountError,
  OriginalAmount,
  PerShareAmount,
  Quantity,
} from "@/lib/money";

describe("PerShareAmount", () => {
  it("akzeptiert 0 und positive Werte, lehnt negative ab (CHECK amount_per_share >= 0)", () => {
    expect(PerShareAmount.fromString("0").toStringValue()).toBe("0.00000000");
    expect(() => PerShareAmount.fromString("-0.01")).toThrow(InvalidPerShareAmountError);
  });

  describe("derive — R-7 Anzeige-Ableitung original_gross ÷ quantity", () => {
    it("berechnet und rundet auf max. 6 Nachkommastellen fuer die Anzeige", () => {
      const gross = OriginalAmount.fromString("100");
      const qty = Quantity.fromString("3");
      // 100 / 3 = 33.333333... -> HALF_UP auf 6 Stellen: 33.333333
      expect(PerShareAmount.derive(gross, qty).toDisplayString()).toBe("33.333333");
    });

    it("wird nicht gespeichert — ist ausschliesslich eine Anzeige-Ableitung", () => {
      // Dokumentationstest: derive() liefert ein PerShareAmount-Objekt, das
      // nur ueber toDisplayString() konsumiert wird; es existiert keine
      // Persistenzmethode dafuer in diesem Modul (DATA_DICTIONARY.md: "A").
      const gross = OriginalAmount.fromString("10");
      const qty = Quantity.fromString("2");
      const derived = PerShareAmount.derive(gross, qty);
      expect(derived.toDisplayString()).toBe("5.000000");
    });
  });
});
