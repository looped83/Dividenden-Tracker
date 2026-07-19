import { supabase } from "@/lib/supabase/client";
import type { Database, PaymentType } from "@/lib/supabase/database.types";

export type DividendPayment = Database["public"]["Tables"]["dividend_payments"]["Row"];
export type DividendPaymentInsert =
  Database["public"]["Tables"]["dividend_payments"]["Insert"];
export type DividendPaymentUpdate =
  Database["public"]["Tables"]["dividend_payments"]["Update"];

export interface PaymentFilters {
  depotId?: string | undefined;
  securityId?: string | undefined;
  paymentType?: PaymentType | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  includeArchived?: boolean | undefined;
  searchTerm?: string | undefined;
}

/**
 * Suche wirkt auf den verknuepften Wertpapiernamen (PostgREST-Filter ueber
 * die FK-Relation), da die Zahlungstabelle selbst keinen Namen speichert.
 */
export async function fetchPayments(
  filters: PaymentFilters = {},
): Promise<DividendPayment[]> {
  let query = supabase
    .from("dividend_payments")
    .select("*, securities!inner(name, ticker)")
    .order("pay_date", { ascending: false });

  if (!filters.includeArchived) {
    query = query.is("archived_at", null);
  }
  if (filters.depotId) {
    query = query.eq("depot_id", filters.depotId);
  }
  if (filters.securityId) {
    query = query.eq("security_id", filters.securityId);
  }
  if (filters.paymentType) {
    query = query.eq("payment_type", filters.paymentType);
  }
  if (filters.fromDate) {
    query = query.gte("pay_date", filters.fromDate);
  }
  if (filters.toDate) {
    query = query.lte("pay_date", filters.toDate);
  }
  if (filters.searchTerm) {
    query = query.or(
      `name.ilike.%${filters.searchTerm}%,ticker.ilike.%${filters.searchTerm}%`,
      { referencedTable: "securities" },
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchPaymentById(id: string): Promise<DividendPayment> {
  const { data, error } = await supabase
    .from("dividend_payments")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createPayment(
  input: DividendPaymentInsert,
): Promise<DividendPayment> {
  const { data, error } = await supabase
    .from("dividend_payments")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePayment(
  id: string,
  input: DividendPaymentUpdate,
): Promise<DividendPayment> {
  const { data, error } = await supabase
    .from("dividend_payments")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archivePayment(
  id: string,
  reason?: string,
): Promise<DividendPayment> {
  const { data, error } = await supabase.rpc("archive_payment", {
    p_id: id,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data;
}

export async function unarchivePayment(id: string): Promise<DividendPayment> {
  return updatePayment(id, { archived_at: null, archive_reason: null });
}
