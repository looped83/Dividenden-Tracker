/**
 * Erste Zahl eines fertig formatierten Textes („11.293,36 €", „87,5 %",
 * „28/31") — zerlegt, damit Zwischenwerte im selben Format erscheinen.
 */
export interface Figure {
  /** Text vor der Zahl (etwa „+"). */
  prefix: string;
  value: number;
  decimals: number;
  /** Tausenderpunkte, wie im Ausgangstext. */
  grouped: boolean;
  /** Minuszeichen des Ausgangstextes (Bindestrich oder „−"). */
  minus: string;
  /** Text nach der Zahl (Waehrung, Prozent, „/31"). */
  suffix: string;
}

const FIGURE = /([-−]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?/;

export function parseFigure(text: string): Figure | null {
  const match = FIGURE.exec(text);
  if (!match) return null;
  const [whole, sign = "", integer = "", fraction = ""] = match;
  // Nur fuer die Anzeige der Zwischenbilder: Die Endzahl bleibt der Text, den
  // lib/money formatiert hat (CALCULATION_RULES.md #8).
  const magnitude = Number.parseFloat(
    `${integer.replaceAll(".", "")}.${fraction || "0"}`,
  );
  return {
    prefix: text.slice(0, match.index),
    value: sign ? -magnitude : magnitude,
    decimals: fraction.length,
    grouped: integer.includes("."),
    minus: sign || "-",
    suffix: text.slice(match.index + whole.length),
  };
}

/** Zwischenwert im Format der Ausgangszahl. */
export function formatFigure(figure: Figure, value: number): string {
  const fixed = Math.abs(value).toFixed(figure.decimals);
  const [integer = fixed, fraction = ""] = fixed.split(".");
  const digits = figure.grouped ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : integer;
  // Kein „-0,00": Was auf null rundet, steht ohne Vorzeichen.
  const negative = value < 0 && /[1-9]/.test(fixed);
  return `${figure.prefix}${negative ? figure.minus : ""}${digits}${
    fraction ? `,${fraction}` : ""
  }${figure.suffix}`;
}

/** Bremst zum Ende hin ab (ease-out, kubisch). */
export function easeOut(progress: number): number {
  return 1 - (1 - progress) ** 3;
}
