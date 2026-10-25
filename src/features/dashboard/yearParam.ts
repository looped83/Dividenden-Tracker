import type { YearSelection } from "@/lib/statistics";

/**
 * Reine Serialisierung/Validierung des `year`-URL-Parameters (§3). Ohne
 * React-/Supabase-Abhaengigkeit, damit isoliert testbar.
 */

const EARLIEST_YEAR = 1970; // pay_date-Constraint (DATA_MODEL.md §3.5)

/**
 * Parst den `year`-URL-Parameter zu einer Jahresauswahl. Gueltig sind "all" und
 * Jahre im Bereich [1970, aktuelles Jahr]; alles andere faellt sicher auf das
 * aktuelle Jahr zurueck.
 */
export function parseYearSelection(raw: string | null): YearSelection {
  // Je Aufruf gelesen, nicht einmal beim Laden des Moduls: Die installierte App
  // bleibt oft tagelang im Speicher. Ueber Neujahr stand die Uebersicht sonst
  // weiter auf dem alten Jahr und verwarf `?year=` des neuen.
  const currentYear = new Date().getFullYear();
  if (raw === "all") return "all";
  if (raw !== null && /^\d{4}$/.test(raw)) {
    const year = Number.parseInt(raw, 10);
    if (year >= EARLIEST_YEAR && year <= currentYear) return year;
  }
  return currentYear;
}

/** Serialisiert eine Jahresauswahl fuer die URL. */
export function serializeYearSelection(selection: YearSelection): string {
  return selection === "all" ? "all" : String(selection);
}
