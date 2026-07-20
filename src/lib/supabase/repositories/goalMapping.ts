import type { Database } from "@/lib/supabase/database.types";
import { EUR, Money } from "@/lib/money";
import type { Goal } from "@/lib/goals";

export type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
export type GoalInsert = Database["public"]["Tables"]["goals"]["Insert"];
export type GoalUpdate = Database["public"]["Tables"]["goals"]["Update"];

/**
 * Reine Abbildung einer DB-Zeile auf ein decimal-sicheres Domain-Objekt. Bewusst
 * ohne Supabase-Client-Import, damit sie unabhaengig testbar bleibt (analog
 * normalizeAmountFields).
 */
export function mapGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    goalType: row.goal_type,
    year: row.year,
    month: row.month,
    // PostgREST liefert `numeric` je nach Cast als JSON-Zahl statt als String
    // (siehe normalizeAmountFields) — entgegen dem statischen `string`-Typ.
    // Money.fromString erwartet einen String (parseCanonicalDecimal ruft
    // .trim()); daher defensiv auf einen String normalisieren, damit eine als
    // Zahl transportierte numeric nicht "e.trim is not a function" ausloest.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- Laufzeittyp weicht bewusst vom statischen Typ ab
    targetAmount: Money.fromString(String(row.target_amount), EUR),
    currency: row.currency,
    title: row.title,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
