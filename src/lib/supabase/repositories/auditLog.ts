import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export type AuditLogRow = Database["public"]["Tables"]["audit_log"]["Row"];

/** Aenderungsverlauf einer einzelnen Entitaet, neueste zuerst (UX_AND_DESIGN_SYSTEM.md AuditTrail). */
export async function fetchAuditTrail(
  entityType: string,
  entityId: string,
): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}
