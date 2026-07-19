import type { DecimalInstance } from "./decimalConfig";
import { roundHalfUp } from "./rounding";
import { parseCanonicalDecimal } from "./parsing";
import type { OriginalAmount } from "./originalAmount";
import type { Quantity } from "./quantity";

/** Skala der Dividende je Aktie (DATA_MODEL.md numeric(18,8)). */
export const PER_SHARE_SCALE = 8;

/** Anzeige-Rundung fuer die abgeleitete Dividende je Aktie (R-7: max. 6 Stellen). */
const PER_SHARE_DISPLAY_SCALE = 6;

export class InvalidPerShareAmountError extends Error {
  constructor(value: string) {
    super(`"${value}" ist keine gueltige Dividende je Aktie (muss >= 0 sein).`);
    this.name = "InvalidPerShareAmountError";
  }
}

/** Dividende je Aktie in Originalwaehrung (DATA_MODEL.md CHECK amount_per_share >= 0). */
export class PerShareAmount {
  private readonly value: DecimalInstance;

  private constructor(value: DecimalInstance) {
    this.value = value;
  }

  static fromString(value: string): PerShareAmount {
    const parsed = parseCanonicalDecimal(value, "PerShareAmount");
    if (parsed.isNegative()) {
      throw new InvalidPerShareAmountError(value);
    }
    return new PerShareAmount(roundHalfUp(parsed, PER_SHARE_SCALE));
  }

  private static fromDecimal(value: DecimalInstance): PerShareAmount {
    return new PerShareAmount(roundHalfUp(value, PER_SHARE_SCALE));
  }

  toStringValue(): string {
    return this.value.toFixed(PER_SHARE_SCALE);
  }

  toDecimal(): DecimalInstance {
    return this.value;
  }

  /** R-7: Anzeige-Ableitung, kaufmaennisch gerundet auf max. 6 Nachkommastellen. */
  toDisplayString(): string {
    return roundHalfUp(this.value, PER_SHARE_DISPLAY_SCALE).toFixed(
      PER_SHARE_DISPLAY_SCALE,
    );
  }

  /**
   * R-7: Dividende je Aktie als reine Anzeige-Ableitung aus
   * `original_gross ÷ quantity`. Wird niemals gespeichert (DATA_DICTIONARY.md,
   * Feldklassifikation "abgeleitet").
   */
  static derive(originalGross: OriginalAmount, quantity: Quantity): PerShareAmount {
    return PerShareAmount.fromDecimal(
      originalGross.toDecimal().dividedBy(quantity.toDecimal()),
    );
  }
}
