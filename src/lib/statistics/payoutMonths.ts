/**
 * Gepflegte Ausschuettungsmonate eines Assets (`securities.payout_months`,
 * Werte 1..12): Duplikate und ungueltige Werte entfernt, aufsteigend sortiert.
 * Sie beschreiben den Rhythmus (Prognose, Kalender, Analyse), verschieben aber
 * keine erhaltene Zahlung — die zaehlt immer an ihrem Zahltag (seit 2.54.0).
 */
export function normalizePayoutMonths(
  payoutMonths: readonly number[] | null | undefined,
): number[] {
  if (!payoutMonths) return [];
  const valid = new Set<number>();
  for (const month of payoutMonths) {
    if (Number.isInteger(month) && month >= 1 && month <= 12) valid.add(month);
  }
  return [...valid].sort((a, b) => a - b);
}
