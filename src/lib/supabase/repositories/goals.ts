import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { EUR, Money } from "@/lib/money";
import type { Goal } from "@/lib/goals";

export type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
export type GoalInsert = Database["public"]["Tables"]["goals"]["Insert"];
export type GoalUpdate = Database["public"]["Tables"]["goals"]["Update"];

/**
 * Signalisiert den Verstoss gegen die Eindeutigkeitsregel (Auftrag §21): fuer
 * denselben Zeitraum existiert bereits ein Ziel derselben Art. Wird aus dem
 * Postgres-Fehlercode 23505 (unique_violation) des Index `goals_unique_period`
 * abgeleitet — die Datenbank ist die maszgebliche Instanz, nicht ein Client-Filter.
 */
export class GoalDuplicateError extends Error {
  constructor() {
    super(
      "Für diesen Zeitraum existiert bereits ein Ziel. Öffne das vorhandene Ziel, um es zu bearbeiten.",
    );
    this.name = "GoalDuplicateError";
  }
}

/**
 * Signalisiert einen Optimistic-Concurrency-Konflikt (Auftrag §22): das Ziel
 * wurde zwischen Öffnen und Speichern von anderer Stelle geändert. Vorbild ist
 * die identische Strategie der Zahlungen (updated_at, D-6-3).
 */
export class GoalConflictError extends Error {
  constructor() {
    super(
      "Das Ziel wurde zwischenzeitlich geändert. Die aktuellen Daten wurden neu geladen.",
    );
    this.name = "GoalConflictError";
  }
}

/** Wandelt eine DB-Zeile in ein decimal-sicheres Domain-Objekt (Betrag als Money). */
export function mapGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    goalType: row.goal_type,
    year: row.year,
    month: row.month,
    targetAmount: Money.fromString(row.target_amount, EUR),
    currency: row.currency,
    title: row.title,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Aktuelle Zeile (Row) inkl. updated_at fuer Optimistic Concurrency in der UI. */
export interface GoalWithMeta extends Goal {
  updatedAt: string;
}

/**
 * Alle Ziele des angemeldeten Nutzers (RLS). Fremde Ziele sind serverseitig
 * unsichtbar; es gibt keinen clientseitigen Nutzerfilter als „Sicherheit".
 */
export async function fetchGoals(): Promise<GoalRow[]> {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchGoalById(id: string): Promise<GoalRow> {
  const { data, error } = await supabase.from("goals").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function createGoal(input: GoalInsert): Promise<GoalRow> {
  const { data, error } = await supabase.from("goals").insert(input).select().single();
  if (error) {
    if (isUniqueViolation(error)) throw new GoalDuplicateError();
    throw error;
  }
  return data;
}

/**
 * Aktualisiert ein Ziel. `expectedUpdatedAt` aktiviert Optimistic Concurrency:
 * das UPDATE trifft nur bei unveraendertem `updated_at`; sonst (0 Zeilen →
 * PGRST116 bei `.single()`) ein {@link GoalConflictError} statt stillem
 * Überschreiben. Ein Verstoss gegen die Eindeutigkeit (geaenderter Zeitraum)
 * meldet {@link GoalDuplicateError}.
 */
export async function updateGoal(
  id: string,
  input: GoalUpdate,
  expectedUpdatedAt?: string,
): Promise<GoalRow> {
  let query = supabase.from("goals").update(input).eq("id", id);
  if (expectedUpdatedAt) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }
  const { data, error } = await query.select().single();
  if (error) {
    if (isUniqueViolation(error)) throw new GoalDuplicateError();
    if (expectedUpdatedAt && error.code === "PGRST116") {
      throw new GoalConflictError();
    }
    throw error;
  }
  return data;
}

/**
 * Loescht ein Ziel dauerhaft (Auftrag §23). Es werden ausschliesslich die
 * Zieldefinition und ihre Metadaten entfernt — keine Dividendeneingaenge. Die
 * RLS-Policy `goals_delete_own` laesst dies nur fuer eigene Zeilen zu; ein
 * Versuch auf eine fremde Zeile betrifft 0 Zeilen (kein Leak).
 */
export async function deleteGoal(id: string): Promise<void> {
  const { error, count } = await supabase
    .from("goals")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  if (count === 0) {
    throw new Error(
      "Das Ziel konnte nicht gelöscht werden (nicht gefunden oder keine Berechtigung). Es wurden keine Daten verändert.",
    );
  }
}
