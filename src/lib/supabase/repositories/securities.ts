import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export type Security = Database["public"]["Tables"]["securities"]["Row"];
export type SecurityInsert = Database["public"]["Tables"]["securities"]["Insert"];
export type SecurityUpdate = Database["public"]["Tables"]["securities"]["Update"];

export async function fetchSecurities(): Promise<Security[]> {
  const { data, error } = await supabase
    .from("securities")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createSecurity(input: SecurityInsert): Promise<Security> {
  const { data, error } = await supabase
    .from("securities")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSecurity(
  id: string,
  input: SecurityUpdate,
): Promise<Security> {
  const { data, error } = await supabase
    .from("securities")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archiveSecurity(id: string): Promise<Security> {
  return updateSecurity(id, { archived_at: new Date().toISOString() });
}

export async function unarchiveSecurity(id: string): Promise<Security> {
  return updateSecurity(id, { archived_at: null });
}

/**
 * Endgueltiges Loeschen (Grundsatz 3, PRODUCT_SPEC.md §3): die RLS-Policy
 * `securities_delete_archived_own` (0018) laesst dies ausschliesslich fuer
 * bereits archivierte eigene Unternehmen zu. Verweist noch ein Dividendeneingang
 * oder Import-Alias auf das Unternehmen, weist die Datenbank das Loeschen mit
 * einem Fremdschluesselfehler (23503) ab — historische Zahlungen archivierter
 * Unternehmen bleiben damit erhalten.
 */
export async function deleteSecurity(id: string): Promise<void> {
  const { error, count } = await supabase
    .from("securities")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "Unternehmen kann nicht gelöscht werden, solange noch Dividendeneingänge darauf verweisen. Lösche zuerst die zugehörigen Eingänge.",
      );
    }
    throw error;
  }
  if (count === 0) {
    throw new Error(
      "Unternehmen konnte nicht gelöscht werden (nicht gefunden, nicht archiviert oder keine Berechtigung).",
    );
  }
}
