import type { DataQuality } from "@/lib/supabase/database.types";

/**
 * Stammdaten-Felder, die fuer die Datenqualitaet zaehlen (eine Wahrheit fuer
 * Formular und Import). Name ist ohnehin Pflicht; Notiz und Standard-Depot sind
 * bewusst NICHT enthalten (Notiz ist optional, das Standard-Depot ist eine
 * unverbindliche Zuordnung, kein Stammdatum).
 */
export interface QualityFields {
  ticker?: string | null;
  isin?: string | null;
  wkn?: string | null;
  country?: string | null;
  sector?: string | null;
  currency?: string | null;
}

function isFilled(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== "";
}

/**
 * Leitet die Datenqualitaet aus der Vollstaendigkeit der Stammdaten ab
 * (Nutzerregel: „OK" nur, wenn alle Felder ausser der Notiz gefuellt sind).
 * `needs_review` wird hier nie erzeugt — dieser Zustand entsteht ausschliesslich
 * beim Import aus ungueltigen Quellwerten und hat Vorrang, solange er besteht.
 */
export function deriveDataQuality(
  fields: QualityFields,
): Exclude<DataQuality, "needs_review"> {
  const complete =
    isFilled(fields.ticker) &&
    isFilled(fields.isin) &&
    isFilled(fields.wkn) &&
    isFilled(fields.country) &&
    isFilled(fields.sector) &&
    isFilled(fields.currency);
  return complete ? "ok" : "incomplete";
}
