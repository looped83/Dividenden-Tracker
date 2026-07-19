import { z } from "zod";

// Exportiert, damit src/features/securities/xlsxImport.ts dieselben Regeln
// verwendet statt sie zu duplizieren (eine Wahrheit fuer Formular- und
// Import-Validierung).
export const TICKER_PATTERN = /^[A-Za-z0-9 .-]{1,20}$/;
export const ISIN_PATTERN = /^[A-Za-z]{2}[A-Za-z0-9]{9}[0-9]$/;
export const WKN_PATTERN = /^[A-Za-z0-9]{6}$/;
const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

const optionalUpper = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .regex(pattern, message)
    .transform((value) => value.toUpperCase())
    .optional()
    .or(z.literal(""));

export const securityFormSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich").max(200),
  ticker: z
    .string()
    .trim()
    .regex(TICKER_PATTERN, "Ungültiges Tickerformat")
    .optional()
    .or(z.literal("")),
  isin: optionalUpper(ISIN_PATTERN, "Ungültige ISIN (12 Zeichen, z. B. DE0007164600)"),
  wkn: optionalUpper(WKN_PATTERN, "Ungültige WKN (6 Zeichen)"),
  country: optionalUpper(COUNTRY_PATTERN, "2-stelliger Ländercode, z. B. DE"),
  sector: z.string().trim().max(100).optional().or(z.literal("")),
  currency: optionalUpper(CURRENCY_PATTERN, "3-stelliger Waehrungscode, z. B. EUR"),
  note: z.string().trim().max(5000).optional().or(z.literal("")),
});
export type SecurityFormValues = z.infer<typeof securityFormSchema>;
