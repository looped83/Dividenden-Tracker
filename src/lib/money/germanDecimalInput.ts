/**
 * Wandelt eine deutsch formatierte Nutzereingabe (Komma als Dezimaltrennzeichen,
 * Punkt optional als Tausendertrennzeichen, z. B. "1.234,56") in das kanonische
 * Dezimalstring-Format (Punkt als Trennzeichen, lib/money/parsing.ts) um.
 * Enthaelt die Eingabe kein Komma, wird sie unveraendert durchgereicht (deckt
 * z. B. eingefuegten kanonischen Text ab).
 */
export function normalizeGermanDecimalInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || !trimmed.includes(",")) {
    return trimmed;
  }
  return trimmed.replace(/\./g, "").replace(",", ".");
}

/** Kehrt normalizeGermanDecimalInput um: kanonischer Dezimalstring -> deutsche Anzeige. */
export function toGermanDecimalString(canonical: string): string {
  return canonical.replace(".", ",");
}
