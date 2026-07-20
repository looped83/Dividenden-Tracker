import { EUR, Money } from "@/lib/money";
import type { PaymentSource, PaymentType } from "@/lib/supabase/database.types";
import type { AnalyticsPayment } from "./types";

/**
 * Minimales Zeilenformat, das die Analytics-Schicht benoetigt. Betraege werden
 * hier **einmal** in {@link Money} (Basiswaehrung EUR, DECISIONS.md D-002)
 * geparst — danach keine Rohwerte mehr.
 *
 * `net_amount`/`gross_amount` sind bewusst `string | number`: PostgREST liefert
 * `numeric`-Spalten je nach Cast als JSON-Zahl **oder** String (siehe
 * normalizeAmountFields). Die Analytics-Grenze vertraut dem Transporttyp nicht
 * und normalisiert defensiv auf einen kanonischen Dezimalstring.
 */
export interface RawAnalyticsRow {
  id: string;
  pay_date: string;
  net_amount: string | number;
  gross_amount: string | number;
  security_id: string;
  depot_id: string;
  payment_type: PaymentType;
  source: PaymentSource;
  created_at: string;
}

/** Kanonischer Dezimalstring aus String oder JSON-Zahl (ohne Float-Arithmetik). */
function toDecimalString(value: string | number): string {
  return typeof value === "string" ? value : String(value);
}

export function mapAnalyticsPayment(row: RawAnalyticsRow): AnalyticsPayment {
  return {
    id: row.id,
    // Effektives Datum entspricht zunaechst dem echten Datum; ein evtl.
    // Ausschuettungsplan wird spaeter ueber withEffectiveDates angewandt.
    payDate: row.pay_date,
    actualPayDate: row.pay_date,
    netAmount: Money.fromString(toDecimalString(row.net_amount), EUR),
    grossAmount: Money.fromString(toDecimalString(row.gross_amount), EUR),
    securityId: row.security_id,
    depotId: row.depot_id,
    paymentType: row.payment_type,
    source: row.source,
    createdAt: row.created_at,
  };
}
