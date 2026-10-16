import Decimal from "decimal.js";

/**
 * Dedizierte Decimal.js-Konfiguration fuer finanzielle Werte
 * (CALCULATION_RULES.md §2): hohe Praezision fuer Zwischenwerte,
 * kaufmaennische Rundung (ROUND_HALF_UP) als Standard, niemals
 * Exponentialschreibweise (verhindert unbeabsichtigte "1e+21"-Darstellungen
 * bei Formatierung/Logging von Geldbetraegen).
 */
export const MoneyDecimal = Decimal.clone({
  precision: 30,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});

export type DecimalInstance = InstanceType<typeof MoneyDecimal>;
