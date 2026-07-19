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
