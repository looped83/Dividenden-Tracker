import { z } from "zod";
import { parseCanonicalDecimal } from "@/lib/money";

const PAYMENT_TYPES = [
  "regular",
  "special",
  "correction",
  "cancellation",
  "refund",
  "other",
] as const;

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
    .refine(isValidDecimal, {
      message: `${label}: ungültige Zahl (z. B. 12.34, Punkt als Dezimaltrennzeichen)`,
    });
}

/** Leerer String bedeutet "nicht angegeben" — Konsumenten pruefen truthy (computeAmounts.ts). */
function optionalDecimalString() {
  return z.string().trim().optional();
}

/**
 * Flaches Schema (kein z.discriminatedUnion) — react-hook-form benoetigt
 * einen einzigen konkreten Feldwertetyp; die Fremdwaehrungs-Bedingung wird
 * stattdessen per `superRefine` erzwungen (DATA_MODEL.md fx_fields_consistency).
 */
export const paymentFormSchema = z
  .object({
    securityId: z.string().trim().min(1, "Wertpapier ist erforderlich"),
    depotId: z.string().trim().min(1, "Depot ist erforderlich"),
    payDate: z.iso.date("Ungültiges Datum"),
    paymentType: z.enum(PAYMENT_TYPES),
    isForeignCurrency: z.boolean(),
    grossAmount: optionalDecimalString(),
    netAmount: optionalDecimalString(),
    originalCurrency: z.string().trim().optional(),
    originalGross: optionalDecimalString(),
    originalNet: optionalDecimalString(),
    fxRate: optionalDecimalString(),
    withholdingTax: decimalString("Kapitalertragsteuer"),
    domesticTax: decimalString("Inländische Steuer"),
    solidaritySurcharge: optionalDecimalString(),
    churchTax: optionalDecimalString(),
    fees: optionalDecimalString(),
    quantity: optionalDecimalString(),
    note: z.string().trim().max(5000).optional().or(z.literal("")),
  })
  .superRefine((values, ctx) => {
    const requireDecimal = (value: string | undefined, path: string, label: string) => {
      if (!value) {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: `${label} ist erforderlich`,
        });
      } else if (!isValidDecimal(value)) {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: `${label}: ungültige Zahl (z. B. 12.34)`,
        });
      }
    };

    if (values.isForeignCurrency) {
      if (!values.originalCurrency || !/^[A-Za-z]{3}$/.test(values.originalCurrency)) {
        ctx.addIssue({
          code: "custom",
          path: ["originalCurrency"],
          message: "3-stelliger Waehrungscode, z. B. USD",
        });
      }
      requireDecimal(values.originalGross, "originalGross", "Brutto (Originalwährung)");
      requireDecimal(values.originalNet, "originalNet", "Netto (Originalwährung)");
      requireDecimal(values.fxRate, "fxRate", "Wechselkurs");
    } else {
      requireDecimal(values.grossAmount, "grossAmount", "Bruttobetrag");
      requireDecimal(values.netAmount, "netAmount", "Nettobetrag");
    }
  });
export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export const archivePaymentSchema = z.object({
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});
export type ArchivePaymentFormValues = z.infer<typeof archivePaymentSchema>;
