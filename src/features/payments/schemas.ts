import { z } from "zod";
import {
  MoneyDecimal,
  type DecimalInstance,
  normalizeGermanDecimalInput,
  parseCanonicalDecimal,
} from "@/lib/money";

/** Nettobetrag ist `numeric(14, 2)` (0009): max. 2 Nachkommastellen, < 10^12. */
const MONEY_SCALE = 2;
const MONEY_MAX = new MoneyDecimal("1e12");

export interface DecimalCheckResult {
  ok: boolean;
  /** Fehlergrund fuer eine praezise, verstaendliche Meldung (§8). */
  reason?: "invalid" | "not_positive" | "too_many_decimals" | "out_of_range";
}

/**
 * Zentrale, decimal-sichere Pruefung eines bereits auf Punkt-Format
 * normalisierten Betrags (CALCULATION_RULES.md R-1): gueltige Zahl, echt
 * groesser null (Stornos laufen ueber den Status, nicht ueber negative
 * Betraege, §8), hoechstens zwei Nachkommastellen und innerhalb der technischen
 * Grenzen der Spalte `numeric(14, 2)`. Keine JavaScript-Fliesskommaarithmetik.
 */
export function checkPositiveMoney(normalized: string): DecimalCheckResult {
  let value: DecimalInstance;
  try {
    value = parseCanonicalDecimal(normalized, "decimal");
  } catch {
    return { ok: false, reason: "invalid" };
  }
  // decimal.js weist Infinity/NaN bereits beim Parsen ab; hier zur Sicherheit.
  if (!value.isFinite()) return { ok: false, reason: "invalid" };
  if (value.decimalPlaces() > MONEY_SCALE) {
    return { ok: false, reason: "too_many_decimals" };
  }
  if (value.lessThanOrEqualTo(0)) return { ok: false, reason: "not_positive" };
  if (value.greaterThanOrEqualTo(MONEY_MAX)) {
    return { ok: false, reason: "out_of_range" };
  }
  return { ok: true };
}

/**
 * Nimmt deutsch formatierte Eingaben entgegen (Komma als Dezimaltrennzeichen,
 * z. B. "12,34") und normalisiert sie auf das kanonische Punkt-Format
 * (CALCULATION_RULES.md R-1), bevor der Wert weiterverarbeitet wird.
 */
function positiveMoneyString(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} ist erforderlich`)
    .transform((value, ctx) => {
      const normalized = normalizeGermanDecimalInput(value);
      const result = checkPositiveMoney(normalized);
      if (!result.ok) {
        const message =
          result.reason === "not_positive"
            ? `${label} muss größer als 0 sein`
            : result.reason === "too_many_decimals"
              ? `${label}: höchstens zwei Nachkommastellen`
              : result.reason === "out_of_range"
                ? `${label} liegt außerhalb des zulässigen Bereichs`
                : `${label}: ungültige Zahl (z. B. 12,34)`;
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return normalized;
    });
}

/** Lokales heutiges Datum als ISO-String (YYYY-MM-DD), ohne Zeitzonenverschiebung. */
export function todayIso(reference: Date = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  const day = String(reference.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MIN_PAY_DATE = "1970-01-01";

/**
 * Zahlungsdatum: gueltiges Kalenderdatum, als fachliches Datum ohne
 * Zeitzonenverschiebung, innerhalb der technischen Grenzen und **nicht in der
 * Zukunft** — es werden ausschliesslich tatsaechlich erhaltene Dividenden
 * dokumentiert (§8; entspricht dem DB-CHECK `pay_date <= current_date`, 0009).
 */
function payDateSchema() {
  return z.iso
    .date("Ungültiges Datum")
    .refine((value) => value >= MIN_PAY_DATE, {
      message: "Zahlungsdatum liegt vor dem 01.01.1970",
    })
    .refine((value) => value <= todayIso(), {
      message: "Zahlungsdatum darf nicht in der Zukunft liegen",
    });
}

/** Auf das Wesentliche reduziertes Formular: Depot, Unternehmen, Zahlungsdatum, Nettobetrag, Notiz. */
export const paymentFormSchema = z.object({
  securityId: z.string().trim().min(1, "Unternehmen ist erforderlich"),
  depotId: z.string().trim().min(1, "Depot ist erforderlich"),
  payDate: payDateSchema(),
  netAmount: positiveMoneyString("Nettobetrag"),
  note: z.string().trim().max(5000, "Notiz: höchstens 5000 Zeichen").optional(),
});
export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export const archivePaymentSchema = z.object({
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});
export type ArchivePaymentFormValues = z.infer<typeof archivePaymentSchema>;
