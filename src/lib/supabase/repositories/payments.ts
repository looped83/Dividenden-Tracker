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

// PostgREST begrenzt eine Antwort auf max. `db-max-rows` Zeilen (Supabase-Default
// 1000). Die gesamte aktive Historie wird daher seitenweise geladen.
const DASHBOARD_PAGE_SIZE = 1000;

export async function fetchDashboardPayments(): Promise<DashboardPaymentRow[]> {
  const all: DashboardPaymentRow[] = [];
  for (let from = 0; ; from += DASHBOARD_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("dividend_payments")
      .select(DASHBOARD_COLUMNS)
      .is("archived_at", null)
      // Stabile, eindeutige Sortierung ueber Seitengrenzen hinweg: `pay_date`
      // ist nicht eindeutig, daher `id` als Tiebreaker (keine doppelten/fehlenden
      // Zeilen bei der Paginierung).
      .order("pay_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + DASHBOARD_PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < DASHBOARD_PAGE_SIZE) break;
  }
  return all;
}

/**
 * Vollstaendige Eingangsliste (Phase-5A-Erweiterung): laedt seitenweise **alle**
 * Zahlungen (optional inkl. archivierter) mit verknuepftem Wertpapiernamen. Die
 * fachliche Filterung nach Zeitraum erfolgt clientseitig ueber den effektiven
 * Monat (Ausschuettungsplan je Unternehmen, CALCULATION_RULES.md §10), daher
 * kein serverseitiger Datumsfilter. Wie beim Dashboard wird ueber das
 * PostgREST-1000er-Limit hinweg paginiert.
 */
export async function fetchAllPayments(opts: {
  includeArchived: boolean;
}): Promise<DividendPayment[]> {
  const PAGE = 1000;
  const all: DividendPayment[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("dividend_payments")
      .select("*, securities!inner(name, ticker)")
      .order("pay_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (!opts.includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) throw error;
    all.push(...data.map(normalizeAmountFields));
    if (data.length < PAGE) break;
  }
  return all;
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

/**
 * Signalisiert einen Optimistic-Concurrency-Konflikt (DECISIONS.md D-6-3): die
 * Zahlung wurde zwischen Öffnen und Speichern von anderer Stelle geändert.
 */
export class PaymentConflictError extends Error {
  constructor() {
    super(
      "Der Dividendeneingang wurde zwischenzeitlich geändert. Die aktuellen Daten wurden neu geladen.",
    );
    this.name = "PaymentConflictError";
  }
}

/**
 * Aktualisiert eine Zahlung. Wird `expectedUpdatedAt` gesetzt, greift Optimistic
 * Concurrency (§9, D-6-3): das UPDATE trifft nur, wenn `updated_at` unverändert
 * ist. Andernfalls (0 Zeilen, PostgREST liefert PGRST116 bei `.single()`) wird
 * ein `PaymentConflictError` geworfen, statt still zu überschreiben.
 */
export async function updatePayment(
  id: string,
  input: DividendPaymentUpdate,
  expectedUpdatedAt?: string,
): Promise<DividendPayment> {
  let query = supabase.from("dividend_payments").update(input).eq("id", id);
  if (expectedUpdatedAt) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }
  const { data, error } = await query.select().single();
  if (error) {
    // PGRST116: „JSON object requested, multiple (or no) rows returned" —
    // hier: keine Zeile, weil `updated_at` nicht mehr passt → Konflikt.
    if (expectedUpdatedAt && error.code === "PGRST116") {
      throw new PaymentConflictError();
    }
    throw error;
  }
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
 * Endgueltiges Loeschen (§13, DECISIONS.md D-6-1): die RLS-Policy
 * `dividend_payments_delete_own` (0020) laesst dies fuer eigene Zeilen zu —
 * aktiv **oder** storniert; ein Versuch auf eine fremde Zeile betrifft 0 Zeilen
 * statt eines Fehlers (kein Leak). Die Loeschung wird ueber den AFTER-DELETE-
 * Trigger atomar im Audit Log protokolliert (0013).
 */
export async function deletePayment(id: string): Promise<void> {
  const { error, count } = await supabase
    .from("dividend_payments")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) {
    // Referenziert noch ein anderer Datensatz die Zahlung (Fremdschluessel),
    // eine verstaendliche Meldung statt des rohen SQL-Fehlers zeigen. Die
    // Import-Herkunftszeile (import_rows) wird ab Migration 0019 automatisch
    // entkoppelt (ON DELETE SET NULL); diese Meldung ist eine Absicherung.
    if (error.code === "23503") {
      throw new Error(
        "Der Dividendeneingang konnte nicht gelöscht werden, weil noch andere Datensätze darauf verweisen. Die Daten wurden nicht verändert.",
      );
    }
    throw error;
  }
  if (count === 0) {
    throw new Error(
      "Der Dividendeneingang konnte nicht gelöscht werden (nicht gefunden oder keine Berechtigung). Die Daten wurden nicht verändert.",
    );
  }
}
