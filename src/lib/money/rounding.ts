import { MoneyDecimal, type DecimalInstance } from "./decimalConfig";

/**
 * Kaufmaennische Rundung (ROUND_HALF_UP) auf `scale` Nachkommastellen.
 * Einzige Rundungsfunktion des Moduls — jede Rundungsstelle aus
 * CALCULATION_RULES.md §3 (R-1, R-2, R-4, R-7) ruft ausschliesslich diese
 * Funktion auf. Es gibt bewusst keine Bankers-Rundung (HALF_EVEN).
 */
export function roundHalfUp(value: DecimalInstance, scale: number): DecimalInstance {
  return value.toDecimalPlaces(scale, MoneyDecimal.ROUND_HALF_UP);
}
