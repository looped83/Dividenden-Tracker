import { z } from "zod";
import { parseCanonicalDecimal } from "@/lib/money";

function isValidDecimal(value: string): boolean {
  try {
    parseCanonicalDecimal(value, "decimal");
    return true;
  } catch {
    return false;
  }
}

/** Kanonisches Dezimalformat (Punkt als Trennzeichen, CALCULATION_RULES.md R-1). */
function decimalString(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} ist erforderlich`)
    .refine(isValidDecimal, {
      message: `${label}: ungültige Zahl (z. B. 12.34, Punkt als Dezimaltrennzeichen)`,
    });
}

/** Auf das Wesentliche reduziertes Formular: Depot, Unternehmen, Zahlungsdatum, Nettobetrag. */
export const paymentFormSchema = z.object({
  securityId: z.string().trim().min(1, "Wertpapier ist erforderlich"),
  depotId: z.string().trim().min(1, "Depot ist erforderlich"),
  payDate: z.iso.date("Ungültiges Datum"),
  netAmount: decimalString("Nettobetrag"),
});
export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export const archivePaymentSchema = z.object({
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});
export type ArchivePaymentFormValues = z.infer<typeof archivePaymentSchema>;
