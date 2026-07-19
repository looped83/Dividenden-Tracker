import type { DecimalInstance } from "./decimalConfig";
import { roundHalfUp } from "./rounding";
import { parseCanonicalDecimal } from "./parsing";
import { Money } from "./money";
import type { CurrencyCode } from "./currency";
import type { FxRate } from "./fxRate";

/** Skala von Original-Fremdwaehrungsbetraegen (DATA_MODEL.md numeric(18,6)). */
export const ORIGINAL_AMOUNT_SCALE = 6;

/**
 * Bruttoy/Nettobetrag in der Originalwaehrung einer Zahlung, wie in der
 * Quelle (Abrechnung/Import) angegeben — unrundiert bis zur sechsten Stelle.
 * Vorzeichen ist bewusst nicht eingeschraenkt (Korrekturbuchungen koennen
 * negativ sein; die Vorzeichenregel haengt vom fachlichen `payment_type` ab
 * und wird nicht in diesem generischen Wertobjekt geprueft).
 */
export class OriginalAmount {
  private readonly value: DecimalInstance;

  private constructor(value: DecimalInstance) {
    this.value = value;
  }

  static fromString(value: string): OriginalAmount {
    const parsed = parseCanonicalDecimal(value, "OriginalAmount");
    return new OriginalAmount(roundHalfUp(parsed, ORIGINAL_AMOUNT_SCALE));
  }

  toStringValue(): string {
    return this.value.toFixed(ORIGINAL_AMOUNT_SCALE);
  }

  toDecimal(): DecimalInstance {
    return this.value;
  }

  /**
   * R-2: `Betrag_Basis = Betrag_Original × fx_rate`, anschliessend
   * kaufmaennische Rundung auf 2 Nachkommastellen (Money-Invariante, R-1).
   */
  convertToBaseCurrency(rate: FxRate, baseCurrency: CurrencyCode): Money {
    return Money.fromDecimal(this.value.times(rate.toDecimal()), baseCurrency);
  }
}
