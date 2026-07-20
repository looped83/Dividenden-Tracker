import { EUR, Money } from "@/lib/money";
import type { PaymentSource, PaymentType } from "@/lib/supabase/database.types";
import type { AnalyticsPayment } from "./types";

/**
 * Minimales Zeilenformat, das die Analytics-Schicht benoetigt. Betraege kommen
 * als Postgres-`numeric`-Strings; sie werden hier **einmal** in {@link Money}
 * (Basiswaehrung EUR, DECISIONS.md D-002) geparst — danach keine Rohstrings mehr.
 */
export interface RawAnalyticsRow {
  id: string;
  pay_date: string;
  net_amount: string;
  gross_amount: string;
  security_id: string;
  depot_id: string;
  payment_type: PaymentType;
  source: PaymentSource;
  created_at: string;
}

export function mapAnalyticsPayment(row: RawAnalyticsRow): AnalyticsPayment {
  return {
    id: row.id,
    payDate: row.pay_date,
    netAmount: Money.fromString(row.net_amount, EUR),
    grossAmount: Money.fromString(row.gross_amount, EUR),
    securityId: row.security_id,
    depotId: row.depot_id,
    paymentType: row.payment_type,
    source: row.source,
    createdAt: row.created_at,
  };
}
