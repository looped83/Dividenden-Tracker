/**
 * URL-Zustand des Reiters „Verlauf" — rein, ohne React-Abhaengigkeit, wie
 * {@link ./breakdownParams} und {@link ./comparisonParams}.
 *
 * Die Ebene steht in der Adresse, damit Lesezeichen und der Drill-down aus der
 * Jahrestabelle („Monate von 2025") genau diese Ansicht oeffnen.
 */
export type HistoryGrain = "jahre" | "monate";

/** Liest die Ebene aus der Adresse (`?nach=monate`); Vorgabe sind die Jahre. */
export function parseHistoryGrain(params: URLSearchParams): HistoryGrain {
  return params.get("nach") === "monate" ? "monate" : "jahre";
}

/** Schreibt die Ebene in die Adresse; die Vorgabe steht nicht darin. */
export function applyHistoryGrain(
  params: URLSearchParams,
  grain: HistoryGrain,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (grain === "jahre") next.delete("nach");
  else next.set("nach", grain);
  return next;
}
