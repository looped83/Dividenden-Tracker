/**
 * Alphabetische Vergleiche nach deutschem Alphabet — Umlaute stehen bei ihrem
 * Grundbuchstaben, nicht hinter dem „z".
 *
 * Je ein fertiger `Intl.Collator` statt `a.localeCompare(b, "de")`: Mit
 * Sprachangabe richtet `localeCompare` bei **jedem** Vergleich einen neuen
 * Sortierer ein. 1.500 Namen zu sortieren kostete so rund 40 ms, mit dem
 * wiederverwendeten Sortierer unter 1 ms — bei jedem Wechsel der Sortierung
 * erneut.
 */
const GERMAN = new Intl.Collator("de");
const GERMAN_LOOSE = new Intl.Collator("de", { sensitivity: "base" });

/** Wie `a.localeCompare(b, "de")`. */
export function compareGerman(a: string, b: string): number {
  return GERMAN.compare(a, b);
}

/**
 * Wie `a.localeCompare(b, "de", { sensitivity: "base" })`: Gross- und
 * Kleinschreibung sowie Akzente zaehlen nicht („apple" = „Apple", „a" = „ä").
 */
export function compareGermanLoose(a: string, b: string): number {
  return GERMAN_LOOSE.compare(a, b);
}
