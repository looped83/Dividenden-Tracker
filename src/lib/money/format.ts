import type { DecimalInstance } from "./decimalConfig";
import { roundHalfUp } from "./rounding";
import type { Money } from "./money";

/**
 * R-5: Formatiert einen bereits gerundeten Money-Wert fuer die Anzeige.
 * Der kanonische Dezimalstring wird direkt an Intl.NumberFormat uebergeben
 * (kein Umweg ueber `number`, keine Float-Konvertierung) - die Laufzeit
 * akzeptiert seit ES2020 numerische Strings verlustfrei. TypeScripts
 * `StringNumericLiteral`-Typ (lib.es2023.intl.d.ts) beschraenkt dies statisch
 * auf literale Template-Typen (`` `${number}` ``) und lehnt den zur Laufzeit
 * gebildeten `string`-Typ ab; der Cast ist daher eine gezielte, begruendete
 * Ausnahme fuer eine bekannte TS-Typisierungsluecke, kein Umgehen der
 * Rundungsregel. Es findet hier keine weitere Rundung statt, da Money
 * bereits exakt auf 2 Nachkommastellen normalisiert ist.
 */
export function formatMoney(money: Money, locale = "de-DE"): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(money.toStringValue() as unknown as number);
}

/**
 * R-4: Prozentwerte werden ausschliesslich hier, am Ende der Berechnung,
 * kaufmaennisch auf `fractionDigits` Nachkommastellen gerundet. `value` ist
 * bereits in Prozentpunkten skaliert (z. B. 12.3 fuer "12,3 Prozent"),
 * passend zu den Kennzahlformeln in CALCULATION_RULES.md Paragraph 6 (u. a. "x 100").
 */
export function formatPercent(
  value: DecimalInstance,
  fractionDigits = 1,
  locale = "de-DE",
): string {
  const rounded = roundHalfUp(value, fractionDigits);
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const formattedNumber = formatter.format(
    rounded.toFixed(fractionDigits) as unknown as number,
  );
  return formattedNumber + " %";
}

/** Darstellung eines fehlenden Vergleichswerts (R-6.6/6.9/6.11: Gedankenstrich, nie 0 oder unendlich). */
export const NOT_AVAILABLE = "—";
