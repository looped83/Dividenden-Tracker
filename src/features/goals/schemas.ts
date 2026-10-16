import { z } from "zod";
import { normalizeGermanDecimalInput } from "@/lib/money";
import { checkPositiveMoney } from "@/features/payments/schemas";

/**
 * Technische Jahresgrenzen (Auftrag §21). Bewusst grosszuegig: historische,
 * aktuelle und begrenzt zukuenftige Ziele sind erlaubt, aber keine willkuerlich
 * engen Grenzen. Die harte Untergrenze entspricht der DB (1990); die Obergrenze
 * ist „nur begrenzt in der Zukunft" (aktuelles Jahr + 10).
 */
export const MIN_GOAL_YEAR = 1990;
export function maxGoalYear(reference: Date = new Date()): number {
  return reference.getFullYear() + 10;
}

/** Zentrale, decimal-sichere Betragspruefung (wiederverwendet die Zahlungslogik). */
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
                : `${label}: ungültige Zahl (z. B. 1.000,00)`;
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return normalized;
    });
}

/**
 * Zielformular (Auftrag §20/§21). Client- und Servervalidierung teilen sich diese
 * Regeln; die Datenbank-Constraints (goal_month_consistency, target_amount > 0,
 * Eindeutigkeit) sind die maszgebliche zweite Verteidigungslinie.
 *
 * Jahr/Monat/Zielart werden als Strings aus den <select>-Feldern entgegengenommen
 * und decimal-/integer-sicher geparst. Die Kreuzvalidierung „Monat nur bei
 * Monatszielen" erfolgt in einem superRefine.
 */
export function makeGoalFormSchema(reference: Date = new Date()) {
  const maxYear = maxGoalYear(reference);
  return z
    .object({
      goalType: z.enum(["annual", "monthly"]),
      // Die <select>-Felder liefern Strings; hier decimal-/integer-sicher parsen.
      year: z
        .string()
        .trim()
        .min(1, "Jahr ist erforderlich")
        .transform((value, ctx) => {
          if (!/^\d{1,4}$/.test(value)) {
            ctx.addIssue({ code: "custom", message: "Ungültiges Jahr" });
            return z.NEVER;
          }
          const parsed = Number.parseInt(value, 10);
          if (parsed < MIN_GOAL_YEAR) {
            ctx.addIssue({
              code: "custom",
              message: `Jahr muss mindestens ${String(MIN_GOAL_YEAR)} sein`,
            });
            return z.NEVER;
          }
          if (parsed > maxYear) {
            ctx.addIssue({
              code: "custom",
              message: `Jahr darf höchstens ${String(maxYear)} sein`,
            });
            return z.NEVER;
          }
          return parsed;
        }),
      // Leerer String (kein Monat gewaehlt) → null; sonst 1..12.
      month: z.string().transform((value, ctx) => {
        if (value.trim() === "") return null;
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
          ctx.addIssue({ code: "custom", message: "Ungültiger Monat" });
          return z.NEVER;
        }
        return parsed;
      }),
      targetAmount: positiveMoneyString("Zielbetrag"),
      title: z.string().trim().max(200, "Titel: höchstens 200 Zeichen").optional(),
      note: z.string().trim().max(2000, "Notiz: höchstens 2000 Zeichen").optional(),
    })
    .superRefine((data, ctx) => {
      if (data.goalType === "monthly" && data.month === null) {
        ctx.addIssue({
          code: "custom",
          path: ["month"],
          message: "Für ein Monatsziel ist ein Monat erforderlich",
        });
      }
      if (data.goalType === "annual" && data.month !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["month"],
          message: "Ein Jahresziel darf keinen Monat enthalten",
        });
      }
    });
}

export const goalFormSchema = makeGoalFormSchema();

/** Roh-Eingabewerte des Formulars (vor Transformation). */
export type GoalFormInput = z.input<typeof goalFormSchema>;

/** Validierte, transformierte Ausgabewerte. */
export type GoalFormValues = z.output<typeof goalFormSchema>;
