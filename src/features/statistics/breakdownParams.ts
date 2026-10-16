/**
 * URL-Zustand des Breakdown-Bereichs — rein, ohne React-Abhaengigkeit, damit
 * isoliert testbar (wie {@link ./filterParams} und {@link ./comparisonParams}).
 *
 * Die Ansicht steht in der Adresse, weil sie die Aussage der Tabelle aendert:
 * Wer „Δ Vorjahr" teilt oder als Lesezeichen ablegt, meint diese Ansicht und
 * nicht die Vorgabe.
 */

/** Welche Zahl in den Zellen der Matrix steht. */
export type BreakdownView = "summe" | "veraenderung" | "kumuliert";

const VIEWS: readonly BreakdownView[] = ["summe", "veraenderung", "kumuliert"];

export const BREAKDOWN_VIEW_LABELS: Readonly<Record<BreakdownView, string>> = {
  summe: "Summe je Monat",
  veraenderung: "Δ zum Vorjahresmonat",
  kumuliert: "Aufgelaufen im Jahr",
};

/** Liest die Ansicht aus der URL; unbekannte Werte fallen still auf „summe" zurueck. */
export function parseBreakdownView(params: URLSearchParams): BreakdownView {
  const raw = params.get("ansicht");
  return raw !== null && VIEWS.includes(raw as BreakdownView)
    ? (raw as BreakdownView)
    : "summe";
}

/** Schreibt die Ansicht in die URL; die Vorgabe steht nicht in der Adresse. */
export function applyBreakdownView(
  params: URLSearchParams,
  view: BreakdownView,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (view === "summe") next.delete("ansicht");
  else next.set("ansicht", view);
  return next;
}
