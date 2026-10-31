/**
 * Anzeigename eines Laendercodes (Bestand › Analyse, Planer › Nachkauf).
 */

let countryNames: Intl.DisplayNames | null | undefined;

/**
 * Codes, die Laenderfeld und ISIN-Praefix teilen, aber kein Land sind. „XS"
 * traegt jedes international ueber Euroclear/Clearstream begebene Papier
 * (Anleihen, ETCs/ETPs wie Gold); beim Import landet das ISIN-Praefix dann als
 * Land. Solche Positionen zaehlen in keiner Laender-Auswertung als Land.
 */
const NON_COUNTRY_CODES: ReadonlySet<string> = new Set(["XS"]);

/** Anzeigename fuer Positionen ohne Land (Bestand › Analyse). */
export const NO_COUNTRY_LABEL = "Ohne Länderbezug";

/** `false` fuer Codes wie „XS", die kein Land bezeichnen (Gross-/Kleinschreibung egal). */
export function isCountryCode(code: string): boolean {
  return !NON_COUNTRY_CODES.has(code.trim().toUpperCase());
}

/** „US" → „Vereinigte Staaten"; der Code selbst, wo der Browser ihn nicht kennt. */
export function countryLabel(code: string): string {
  if (!isCountryCode(code)) return NO_COUNTRY_LABEL;
  if (countryNames === undefined) {
    try {
      countryNames = new Intl.DisplayNames(["de"], { type: "region" });
    } catch {
      countryNames = null;
    }
  }
  try {
    return countryNames?.of(code) ?? code;
  } catch {
    return code;
  }
}
