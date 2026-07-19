import type { Database } from "@/lib/supabase/database.types";

type DividendPaymentRow = Database["public"]["Tables"]["dividend_payments"]["Row"];

const NUMERIC_FIELDS = [
  "gross_amount",
  "net_amount",
  "withholding_tax",
  "domestic_tax",
  "solidarity_surcharge",
  "church_tax",
  "fees",
  "original_gross",
  "original_net",
  "fx_rate",
  "quantity",
  "amount_per_share",
] as const satisfies readonly (keyof DividendPaymentRow)[];

/**
 * PostgREST liefert `numeric`-Spalten als JSON-Zahl statt als kanonischen
 * String, sofern nicht explizit auf `text` gecastet wird — im Widerspruch
 * zur App-weiten Annahme "Betraege sind immer Strings" (CALCULATION_RULES.md
 * §1, Money.fromString). Normalisiert alle Betragsfelder direkt hinter der
 * Datenzugriffsschicht, statt jeden Aufrufer defensiv programmieren zu lassen.
 */
export function normalizeAmountFields<T extends DividendPaymentRow>(row: T): T {
  const normalized: T = { ...row };
  for (const field of NUMERIC_FIELDS) {
    const value = normalized[field];
    if (typeof value === "number") {
      (normalized as Record<string, unknown>)[field] = String(value);
    }
  }
  return normalized;
}
