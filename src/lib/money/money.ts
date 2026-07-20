import { MoneyDecimal, type DecimalInstance } from "./decimalConfig";
import { roundHalfUp } from "./rounding";
import { parseCanonicalDecimal } from "./parsing";
import type { CurrencyCode } from "./currency";

/** Skala der Basiswaehrungsbetraege — final gerundet (DATA_MODEL.md numeric(14,2), R-1). */
export const MONEY_SCALE = 2;

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Waehrungen stimmen nicht ueberein: "${a}" vs. "${b}".`);
    this.name = "CurrencyMismatchError";
  }
}

/**
 * Ein Geldbetrag in Basiswaehrung, immer exakt auf 2 Nachkommastellen
 * kaufmaennisch gerundet (CALCULATION_RULES.md R-1). Instanzen sind
 * unveraenderlich; jede Operation liefert einen neuen Wert.
 *
 * Money-Werte duerfen ausschliesslich ueber die Methoden dieser Klasse
 * verrechnet werden — kein `+`/`-` auf rohen Zahlen, kein `parseFloat`
 * (CALCULATION_RULES.md §8, projektweit per ESLint erzwungen).
 */
export class Money {
  private readonly value: DecimalInstance;
  readonly currency: CurrencyCode;

  private constructor(value: DecimalInstance, currency: CurrencyCode) {
    this.value = value;
    this.currency = currency;
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(new MoneyDecimal(0), currency);
  }

  /**
   * Erstellt einen Money-Wert aus einem kanonischen Dezimalstring (Punkt als
   * Trennzeichen, keine Tausendertrennzeichen). Rundet gemaess R-1
   * kaufmaennisch auf 2 Nachkommastellen.
   */
  static fromString(value: string, currency: CurrencyCode): Money {
    const parsed = parseCanonicalDecimal(value, "Money");
    return new Money(roundHalfUp(parsed, MONEY_SCALE), currency);
  }

  /** Fuer die interne Weiterverarbeitung (z. B. Waehrungsumrechnung R-2). */
  static fromDecimal(value: DecimalInstance, currency: CurrencyCode): Money {
    return new Money(roundHalfUp(value, MONEY_SCALE), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(
      roundHalfUp(this.value.plus(other.value), MONEY_SCALE),
      this.currency,
    );
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(
      roundHalfUp(this.value.minus(other.value), MONEY_SCALE),
      this.currency,
    );
  }

  negate(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  /** -1 wenn kleiner, 0 wenn gleich, 1 wenn groesser als `other`. */
  compareTo(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    const result = this.value.comparedTo(other.value);
    // comparedTo liefert nur bei NaN-Operanden ein Ergebnis ausserhalb von
    // {-1,0,1}; Money-Werte entstehen ausschliesslich aus validierten,
    // endlichen Dezimalstrings, sodass dieser Fall praktisch nicht eintritt.
    if (result === -1 || result === 0 || result === 1) {
      return result;
    }
    throw new Error("Unerwartetes Vergleichsergebnis bei Money.compareTo.");
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  /** Kanonischer Dezimalstring fuer Transport/Speicherung (Postgres numeric). */
  toStringValue(): string {
    return this.value.toFixed(MONEY_SCALE);
  }

  /** Nur fuer Weiterverarbeitung innerhalb von lib/money bzw. lib/statistics. */
  toDecimal(): DecimalInstance {
    return this.value;
  }

  /**
   * Ausschliesslich fuer die visuelle Darstellung (z. B. Balkenhoehen in
   * Diagrammen), die zwingend eine `number` erfordert. **Nie** fuer Arithmetik
   * oder angezeigte Betragswerte verwenden — diese laufen ueber Money/Decimal
   * bzw. formatMoney (CALCULATION_RULES.md §1/§8). Die Umwandlung nutzt
   * Decimal.toNumber() und kann bei sehr grossen Werten an Praezision verlieren;
   * das ist fuer Pixelhoehen ohne Belang.
   */
  toChartNumber(): number {
    return this.value.toNumber();
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}

/** R-3: Summen ueber bereits gerundete Money-Werte sind exakt — keine erneute Rundung. */
export function sumMoney(amounts: readonly Money[], currency: CurrencyCode): Money {
  return amounts.reduce((total, amount) => total.add(amount), Money.zero(currency));
}
