import { supabase } from "@/lib/supabase/client";
import type { Database, PaymentType } from "@/lib/supabase/database.types";
import { normalizeAmountFields } from "@/lib/supabase/repositories/normalizeAmountFields";

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
  return data.map(normalizeAmountFields);
}

/**
 * Schlanke Datenbasis fuer das Dashboard (Phase 5A): ausschliesslich aktive
 * Eingaenge (`archived_at is null`) des angemeldeten Nutzers (RLS), reduziert
 * auf die von der Analytics-Schicht benoetigten Spalten. Es wird **einmal** die
 * gesamte aktive Historie uebertragen und clientseitig fuer alle Kennzahlen
 * aggregiert (ARCHITECTURE.md, Query-Strategie 5A) — keine Uebertragung roher
 * Daten je KPI und kein N+1. Stornierte und zurueckgerollte (archivierte)
 * Zahlungen sind damit standardmaessig ausgeschlossen; archivierte Unternehmen
 * und Depots bleiben ueber ihre weiterhin aktiven Zahlungen enthalten.
 */
export type DashboardPaymentRow = Pick<
  DividendPayment,
  | "id"
  | "pay_date"
  | "net_amount"
  | "gross_amount"
  | "security_id"
  | "depot_id"
  | "payment_type"
  | "source"
  | "created_at"
>;

const DASHBOARD_COLUMNS =
  "id, pay_date, net_amount, gross_amount, security_id, depot_id, payment_type, source, created_at";

export async function fetchDashboardPayments(): Promise<DashboardPaymentRow[]> {
  const { data, error } = await supabase
    .from("dividend_payments")
    .select(DASHBOARD_COLUMNS)
    .is("archived_at", null)
    .order("pay_date", { ascending: false });
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
  return normalizeAmountFields(data);
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
  return normalizeAmountFields(data);
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
  return normalizeAmountFields(data);
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
  return normalizeAmountFields(data);
}

export async function unarchivePayment(id: string): Promise<DividendPayment> {
  return updatePayment(id, { archived_at: null, archive_reason: null });
}

/**
 * Endgueltiges Loeschen (Grundsatz 3, PRODUCT_SPEC.md §3): die RLS-Policy
 * `dividend_payments_delete_archived_own` (0013) laesst dies ausschliesslich
 * fuer bereits archivierte eigene Zeilen zu; ein Versuch auf eine nicht
 * archivierte oder fremde Zeile betrifft 0 Zeilen statt eines Fehlers.
 */
export async function deletePayment(id: string): Promise<void> {
  const { error, count } = await supabase
    .from("dividend_payments")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  if (count === 0) {
    throw new Error(
      "Eingang konnte nicht geloescht werden (nicht gefunden, nicht archiviert oder keine Berechtigung).",
    );
  }
}
