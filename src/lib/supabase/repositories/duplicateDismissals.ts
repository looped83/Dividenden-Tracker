import { supabase } from "@/lib/supabase/client";
import { pairKey } from "@/lib/payments/dataQuality";

/**
 * Persistente „keine Dublette"-Entscheidungen (Phase 6 §16, DECISIONS.md D-6-4).
 * `pair_key` (aus `pairKey`) ist der stabile, lexikografisch sortierte Schlüssel
 * zweier Zahlungs-IDs; er identifiziert ein bewusst als „keine Dublette"
 * markiertes Paar unabhängig von der Reihenfolge — dieselbe Funktion wie in der
 * Erkennung (`findDuplicatePairs`), damit Markierung und Ausblendung
 * garantiert übereinstimmen.
 */

export async function fetchDuplicateDismissals(): Promise<string[]> {
  const { data, error } = await supabase.from("duplicate_dismissals").select("pair_key");
  if (error) throw error;
  return data.map((row) => row.pair_key);
}

export async function dismissDuplicate(idA: string, idB: string): Promise<void> {
  const { error } = await supabase
    .from("duplicate_dismissals")
    .insert({ pair_key: pairKey(idA, idB) });
  // Doppelte Markierung (unique-Verletzung) ist unkritisch — die Entscheidung
  // besteht bereits.
  if (error && error.code !== "23505") throw error;
}

export async function undismissDuplicate(idA: string, idB: string): Promise<void> {
  const { error } = await supabase
    .from("duplicate_dismissals")
    .delete()
    .eq("pair_key", pairKey(idA, idB));
  if (error) throw error;
}
