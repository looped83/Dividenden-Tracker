import type { DecimalInstance } from "./decimalConfig";
import { roundHalfUp } from "./rounding";
import type { Money } from "./money";

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Ein Formatierer je Einstellung, einmal gebaut und danach wiederverwendet.
 * Einen `Intl.NumberFormat` einzurichten kostet ein Vielfaches des
 * Formatierens selbst (gemessen: Faktor ~60) — eine Tabelle mit einigen
 * hundert Betraegen richtete sonst bei jedem Zeichnen einige hundert
 * Formatierer ein. Die Zahl der Schluessel ist klein (Sprache × Waehrung bzw.
 * Nachkommastellen), der Speicher waechst also nicht mit den Daten.
 */
function numberFormat(key: string, create: () => Intl.NumberFormat): Intl.NumberFormat {
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = create();
    formatters.set(key, formatter);
  }
  return formatter;
}

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
  const formatter = numberFormat(
    `money|${locale}|${money.currency}`,
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: money.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  );
  return formatter.format(money.toStringValue() as unknown as number);
}

/**
 * Betrag ohne Waehrungszeichen: „1.234,56". Fuer dichte Tabellen, in denen
 * die Waehrung einmal fuer alle Zellen genannt wird — wie an den
 * Diagrammachsen (UX_AND_DESIGN_SYSTEM.md §3). Sonst immer `formatMoney`.
 */
export function formatAmount(money: Money, locale = "de-DE"): string {
  const formatter = numberFormat(
    `amount|${locale}`,
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  );
  return formatter.format(money.toStringValue() as unknown as number);
}

/**
 * Waehrungszeichen eines ISO-Codes in der Anzeigesprache — „€" fuer EUR,
 * „$" fuer USD. Faellt die Laufzeit auf den Code zurueck (unbekannte oder
 * zeichenlose Waehrung), steht eben dieser da; erfunden wird nichts.
 *
 * Fuer Beschriftungen an Eingabefeldern; formatierte Betraege bringen ihr
 * Zeichen ueber `formatMoney` mit.
 */
export function currencySymbol(currency: string, locale = "de-DE"): string {
  const parts = numberFormat(
    `symbol|${locale}|${currency}`,
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
  ).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currency;
}

/**
 * R-4: Prozentwerte werden ausschliesslich hier, am Ende der Berechnung,
 * kaufmaennisch auf `fractionDigits` Nachkommastellen gerundet. `value` ist
 * bereits in Prozentpunkten skaliert (z. B. 12.3 fuer "12,3 Prozent"),
 * passend zu den Kennzahlformeln in CALCULATION_RULES.md Paragraph 6 (u. a. "x 100").
 *
 * Zwischen Zahl und Zeichen steht ein geschuetztes Leerzeichen — wie beim
 * Betrag, den `Intl` ebenso setzt. Mit einem gewoehnlichen brach „5,11 %" in
 * einer schmalen Kachel zwischen Zahl und Prozentzeichen um.
 */
export function formatPercent(
  value: DecimalInstance,
  fractionDigits = 1,
  locale = "de-DE",
): string {
  const rounded = roundHalfUp(value, fractionDigits);
  const formatter = numberFormat(
    `percent|${locale}|${String(fractionDigits)}`,
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }),
  );
  const formattedNumber = formatter.format(
    rounded.toFixed(fractionDigits) as unknown as number,
  );
  return formattedNumber + "\u00A0%";
}

/** Darstellung eines fehlenden Vergleichswerts (R-6.6/6.9/6.11: Gedankenstrich, nie 0 oder unendlich). */
export const NOT_AVAILABLE = "—";
