import { supabase } from "@/lib/supabase/client";
import { anomalyKey, type AnomalyCode } from "@/lib/payments/dataQuality";

/**
 * Persistente „geprüft, in Ordnung"-Entscheidungen zu auffälligen Eingängen
 * (Datenqualität, DECISIONS.md D-6-4) — das Gegenstück zu den „keine
 * Dublette"-Markierungen. Geliefert werden die Schlüssel aus `anomalyKey`,
 * dieselbe Funktion wie in der Ansicht, damit Markierung und Ausblendung
 * garantiert übereinstimmen.
 */

export async function fetchAnomalyReviews(): Promise<string[]> {
  const { data, error } = await supabase
    .from("anomaly_reviews")
    .select("payment_id, code");
  if (error) throw error;
  return data.map((row) => anomalyKey(row.payment_id, row.code));
}

export async function markAnomalyReviewed(
  paymentId: string,
  code: AnomalyCode,
): Promise<void> {
  const { error } = await supabase
    .from("anomaly_reviews")
    .insert({ payment_id: paymentId, code });
  // Doppelte Markierung (unique-Verletzung) ist unkritisch — die Entscheidung
  // besteht bereits.
  if (error && error.code !== "23505") throw error;
}

export async function unmarkAnomalyReviewed(
  paymentId: string,
  code: AnomalyCode,
): Promise<void> {
  const { error } = await supabase
    .from("anomaly_reviews")
    .delete()
    .eq("payment_id", paymentId)
    .eq("code", code);
  if (error) throw error;
}
