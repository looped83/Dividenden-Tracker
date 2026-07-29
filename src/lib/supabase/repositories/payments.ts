import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeAmountFields } from "@/lib/supabase/repositories/normalizeAmountFields";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";

export type DividendPayment = Database["public"]["Tables"]["dividend_payments"]["Row"];
export type DividendPaymentInsert =
  Database["public"]["Tables"]["dividend_payments"]["Insert"];
export type DividendPaymentUpdate =
  Database["public"]["Tables"]["dividend_payments"]["Update"];

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
  return fetchAllPages<DashboardPaymentRow>((from, to) =>
    supabase
      .from("dividend_payments")
      .select(DASHBOARD_COLUMNS)
      .is("archived_at", null)
      // Stabile, eindeutige Sortierung ueber Seitengrenzen hinweg: `pay_date`
      // ist nicht eindeutig, daher `id` als Tiebreaker (keine doppelten/fehlenden
      // Zeilen bei der Paginierung).
      .order("pay_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/**
 * Vollstaendige Eingangsliste (Phase-5A-Erweiterung): laedt seitenweise **alle**
 * Zahlungen (optional inkl. archivierter) mit verknuepftem Wertpapiernamen. Die
 * fachliche Filterung nach Zeitraum erfolgt clientseitig ueber den effektiven
 * Monat (Ausschuettungsplan je Unternehmen, CALCULATION_RULES.md §10), daher
 * kein serverseitiger Datumsfilter. Wie beim Dashboard wird ueber das
 * PostgREST-1000er-Limit hinweg paginiert.
 */
/**
 * Spalten, die Liste und Datenqualitaet tatsaechlich lesen — bewusst nicht
 * `*`: Von den 30 Spalten der Tabelle braucht die Liste neun, die
 * Datenqualitaet drei weitere. Die uebrigen sind ueberwiegend `null`
 * (Steuern, Fremdwaehrung, Stueckzahl, Importherkunft) und kosteten bei
 * vierstelliger Historie mehrere hundert Kilobyte reines `"spalte":null` je
 * Ladevorgang.
 *
 * Beim Erweitern hier **und** im Typ `PaymentListRow` nachziehen, sonst
 * verspricht der Typ ein Feld, das die Antwort nicht enthaelt.
 */
// Ein einziges Literal, nicht zusammengesetzt: PostgREST leitet den
// Ergebnistyp aus dem Text der Auswahl ab; eine Verkettung waere fuer die
// Typebene undurchsichtig.
// prettier-ignore
const LIST_COLUMNS = "id, security_id, depot_id, pay_date, net_amount, original_currency, payment_type, source, import_id, archived_at, created_at, updated_at, securities!inner(name, ticker)";

/** Zeile der Eingangsliste — die Projektion von {@link LIST_COLUMNS}. */
export type PaymentListRow = Pick<
  DividendPayment,
  | "id"
  | "security_id"
  | "depot_id"
  | "pay_date"
  | "net_amount"
  | "original_currency"
  | "payment_type"
  | "source"
  | "import_id"
  | "archived_at"
  | "created_at"
  | "updated_at"
> & { securities?: { name: string; ticker: string | null } | null };

export async function fetchAllPayments(opts: {
  includeArchived: boolean;
}): Promise<PaymentListRow[]> {
  const rows = await fetchAllPages<PaymentListRow>((from, to) => {
    const query = supabase
      .from("dividend_payments")
      .select(LIST_COLUMNS)
      .order("pay_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    return opts.includeArchived ? query : query.is("archived_at", null);
  });
  return rows.map(normalizeAmountFields);
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
