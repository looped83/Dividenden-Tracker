import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export type Depot = Database["public"]["Tables"]["depots"]["Row"];
export type DepotInsert = Database["public"]["Tables"]["depots"]["Insert"];
export type DepotUpdate = Database["public"]["Tables"]["depots"]["Update"];

export async function fetchDepots(): Promise<Depot[]> {
  const { data, error } = await supabase
    .from("depots")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createDepot(input: DepotInsert): Promise<Depot> {
  const { data, error } = await supabase.from("depots").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateDepot(id: string, input: DepotUpdate): Promise<Depot> {
  const { data, error } = await supabase
    .from("depots")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archiveDepot(id: string): Promise<Depot> {
  return updateDepot(id, { archived_at: new Date().toISOString() });
}

export async function unarchiveDepot(id: string): Promise<Depot> {
  return updateDepot(id, { archived_at: null });
}
