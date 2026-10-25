/**
 * Anzeigename eines Laendercodes (Bestand › Analyse, Planer › Nachkauf).
 */

let countryNames: Intl.DisplayNames | null | undefined;

/**
 * Codes, die Laenderfeld und ISIN-Praefix teilen, aber kein Land sind. „XS"
 * traegt jedes international ueber Euroclear/Clearstream begebene Papier
 * (Anleihen, ETCs/ETPs); beim Import landet das ISIN-Praefix dann als Land.
 */
const NON_COUNTRY_LABELS: Readonly<Record<string, string>> = {
  XS: "International (XS)",
};

/** „US" → „Vereinigte Staaten"; der Code selbst, wo der Browser ihn nicht kennt. */
export function countryLabel(code: string): string {
  const special = NON_COUNTRY_LABELS[code];
  if (special) return special;
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
