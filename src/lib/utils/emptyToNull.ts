/**
 * Leerer String (aus optionalen Formularfeldern) wird zu `null` fuer die DB.
 * Bewusst ein Truthy-Check statt `??`: "" ist nicht nullish, soll hier aber
 * wie "nicht angegeben" behandelt werden.
 */
export function emptyToNull(value: string | undefined): string | null {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- "" ist absichtlich eingeschlossen, nicht nur null/undefined
  return value ? value : null;
}
