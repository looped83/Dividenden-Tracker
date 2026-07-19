import { z } from "zod";
import { normalizeGermanDecimalInput, parseCanonicalDecimal } from "@/lib/money";

function isValidDecimal(value: string): boolean {
  try {
    parseCanonicalDecimal(value, "decimal");
    return true;
  } catch {
    return false;
  }
}

/**
 * Nimmt deutsch formatierte Eingaben entgegen (Komma als Dezimaltrennzeichen,
 * z. B. "12,34") und normalisiert sie auf das kanonische Punkt-Format
 * (CALCULATION_RULES.md R-1), bevor der Wert weiterverarbeitet wird.
 */
function decimalString(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} ist erforderlich`)
    .transform((value, ctx) => {
      const normalized = normalizeGermanDecimalInput(value);
      if (!isValidDecimal(normalized)) {
        ctx.addIssue({
          code: "custom",
          message: `${label}: ungültige Zahl (z. B. 12,34)`,
        });
        return z.NEVER;
      }
      return normalized;
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
