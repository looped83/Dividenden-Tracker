import type { DecimalInstance } from "./decimalConfig";
import { roundHalfUp } from "./rounding";
import { parseCanonicalDecimal } from "./parsing";

/** Skala des Wechselkurses (DATA_MODEL.md numeric(18,8)). */
export const FX_RATE_SCALE = 8;

export class InvalidFxRateError extends Error {
  constructor(value: string) {
    super(`"${value}" ist kein gueltiger Wechselkurs (muss > 0 sein).`);
    this.name = "InvalidFxRateError";
  }
}

/**
 * Wechselkurs in der Konvention "Einheiten Basiswaehrung je 1 Einheit
 * Originalwaehrung" (CALCULATION_RULES.md R-2, DECISIONS.md D-... siehe
 * ARCHITECTURE.md). `Betrag_Basis = Betrag_Original × fx_rate`.
 */
export class FxRate {
  private readonly value: DecimalInstance;

  private constructor(value: DecimalInstance) {
    this.value = value;
  }

  static fromString(value: string): FxRate {
    const parsed = parseCanonicalDecimal(value, "FxRate");
    if (parsed.isNegative() || parsed.isZero()) {
      throw new InvalidFxRateError(value);
    }
    return new FxRate(roundHalfUp(parsed, FX_RATE_SCALE));
  }

  toStringValue(): string {
    return this.value.toFixed(FX_RATE_SCALE);
  }

  toDecimal(): DecimalInstance {
    return this.value;
  }
}
