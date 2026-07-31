import type { PaymentType } from "@/lib/supabase/database.types";

/**
 * Die Zahlungsarten in der Sprache der Oberflaeche.
 *
 * Liegt in `lib`, nicht in einem Bereich: Filterleiste, Statistik und
 * Datenexport brauchen dieselben Bezeichnungen. Zwei Kopien wuerden
 * auseinanderlaufen, sobald eine Art umbenannt wird.
 */
const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  regular: "Regulär",
  special: "Sonderdividende",
  correction: "Korrektur",
  cancellation: "Stornierung",
  refund: "Erstattung",
  other: "Sonstige",
};

export function describePaymentType(type: PaymentType): string {
  return PAYMENT_TYPE_LABELS[type];
}

export const PAYMENT_TYPE_VALUES: readonly PaymentType[] = [
  "regular",
  "special",
  "correction",
  "cancellation",
  "refund",
  "other",
];
