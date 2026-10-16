import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export type Portfolio = Database["public"]["Tables"]["portfolios"]["Row"];
export type PortfolioInsert = Database["public"]["Tables"]["portfolios"]["Insert"];
export type PortfolioUpdate = Database["public"]["Tables"]["portfolios"]["Update"];

export async function fetchPortfolios(): Promise<Portfolio[]> {
  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createPortfolio(input: PortfolioInsert): Promise<Portfolio> {
  const { data, error } = await supabase
    .from("portfolios")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePortfolio(
  id: string,
  input: PortfolioUpdate,
): Promise<Portfolio> {
  const { data, error } = await supabase
    .from("portfolios")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archivePortfolio(id: string): Promise<Portfolio> {
  return updatePortfolio(id, { archived_at: new Date().toISOString() });
}

export async function unarchivePortfolio(id: string): Promise<Portfolio> {
  return updatePortfolio(id, { archived_at: null });
}
