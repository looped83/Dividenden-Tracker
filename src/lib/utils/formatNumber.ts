const integerFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

/**
 * Ganze Zahl in deutscher Schreibweise — mit Tausenderpunkt (1.439).
 *
 * Gilt fuer jede angezeigte Zahl, nicht nur fuer Betraege: Anzahlen,
 * Seitenangaben, Zeilenzahlen. Betraege und Prozentwerte formatieren
 * `formatMoney`/`formatPercent` (lib/money), die dieselbe Schreibweise
 * verwenden.
 */
export function formatCountNumber(value: number): string {
  return integerFormatter.format(value);
}

/** Zahl mit Substantiv: „1 Zahlung", „1.439 Zahlungen". */
export function formatCountNoun(count: number, singular: string, plural: string): string {
  return `${formatCountNumber(count)} ${count === 1 ? singular : plural}`;
}
