import { MoneyDecimal, type DecimalInstance } from "./decimalConfig";

/**
 * Kanonisches Dezimalstring-Format: optionales Vorzeichen, Ziffern, optional
 * ein Punkt als Dezimaltrennzeichen. Keine Tausendertrennzeichen, kein Komma.
 * Dieses Modul parst ausschliesslich das kanonische (Transport-)Format —
 * lokale Eingabeformate (deutsch/englisch, Tausendertrennzeichen) werden von
 * lib/parsing (Phase 3/4, IMPORT_SPEC.md, CALCULATION_RULES.md §7) zuvor in
 * dieses Format normalisiert.
 */
const CANONICAL_DECIMAL_PATTERN = /^[+-]?\d+(\.\d+)?$/;

export class InvalidDecimalStringError extends Error {
  constructor(value: string, context: string) {
    super(
      `"${value}" ist kein gueltiger kanonischer Dezimalstring (Kontext: ${context}). ` +
        "Erwartet wird ein optionales Vorzeichen, Ziffern und optional ein Punkt " +
        "als Dezimaltrennzeichen, ohne Tausendertrennzeichen.",
    );
    this.name = "InvalidDecimalStringError";
  }
}

export function parseCanonicalDecimal(value: string, context: string): DecimalInstance {
  const trimmed = value.trim();
  if (trimmed === "" || !CANONICAL_DECIMAL_PATTERN.test(trimmed)) {
    throw new InvalidDecimalStringError(value, context);
  }
  return new MoneyDecimal(trimmed);
}
