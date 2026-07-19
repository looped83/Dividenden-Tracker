import type { DecimalInstance } from "./decimalConfig";
import { roundHalfUp } from "./rounding";
import { parseCanonicalDecimal } from "./parsing";

/** Skala der Stueckzahl (DATA_MODEL.md numeric(18,6), Bruchteile fuer Sparplaene). */
export const QUANTITY_SCALE = 6;

export class InvalidQuantityError extends Error {
  constructor(value: string) {
    super(`"${value}" ist keine gueltige Stueckzahl (muss > 0 sein).`);
    this.name = "InvalidQuantityError";
  }
}

/** Stueckzahl eines Wertpapiers, immer > 0 (DATA_MODEL.md CHECK quantity > 0). */
export class Quantity {
  private readonly value: DecimalInstance;

  private constructor(value: DecimalInstance) {
    this.value = value;
  }

  static fromString(value: string): Quantity {
    const parsed = parseCanonicalDecimal(value, "Quantity");
    if (parsed.isNegative() || parsed.isZero()) {
      throw new InvalidQuantityError(value);
    }
    return new Quantity(roundHalfUp(parsed, QUANTITY_SCALE));
  }

  toStringValue(): string {
    return this.value.toFixed(QUANTITY_SCALE);
  }

  toDecimal(): DecimalInstance {
    return this.value;
  }
}
