import { supabase } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import type { Database } from "@/lib/supabase/database.types";

export type SecuritySnapshot = Database["public"]["Tables"]["security_snapshots"]["Row"];
export type SecuritySnapshotInsert =
  Database["public"]["Tables"]["security_snapshots"]["Insert"];
export type SecuritySnapshotRun =
  Database["public"]["Tables"]["security_snapshot_runs"]["Row"];

/** Quelle dieser Staende; eine Stelle fuer Abfrage und Anzeige. */
export const SNAPSHOT_SOURCE = "divvydiary_csv";

const NUMERIC_FIELDS = [
  "quantity",
  "buyin_per_share",
  "buyin_total",
  "price",
  "market_value",
  "gain_absolute",
  "gain_relative",
  "allocation",
  "dividend_yield",
  "dividend_yield_on_buyin",
  "annual_dividend_total",
  "dividend_per_share",
  "dividend_cagr",
] as const satisfies readonly (keyof SecuritySnapshot)[];

/**
 * PostgREST liefert `numeric`-Spalten als JSON-Zahl statt als kanonischen
 * String — im Widerspruch zur app-weiten Annahme „Betraege sind immer Strings"
 * (CALCULATION_RULES.md §1, `Money.fromString`). Dieselbe Normalisierung wie
 * `normalizeAmountFields` fuer Zahlungen, nur fuer die Felder dieser Tabelle:
 * einmal direkt hinter der Datenzugriffsschicht, statt jeden Aufrufer defensiv
 * programmieren zu lassen.
 */
function normalizeNumericFields(row: SecuritySnapshot): SecuritySnapshot {
  const normalized: SecuritySnapshot = { ...row };
  for (const field of NUMERIC_FIELDS) {
    const value = normalized[field];
    if (typeof value === "number") {
      (normalized as Record<string, unknown>)[field] = String(value);
    }
  }
  return normalized;
}

/**
 * Alle Depotstaende des angemeldeten Nutzers (RLS), aeltester Stichtag zuerst.
 *
 * Bewusst **alle** statt nur des juengsten Stands: Die Detailseite zeichnet
 * daraus den Verlauf, und die Datenmenge ist klein (eine Zeile je Position und
 * Stichtag — bei monatlichem Upload rund 650 Zeilen im Jahr). Eine zweite
 * Abfrage je Unternehmen waere teurer als diese eine.
 *
 * Eindeutige Sortierung (Stichtag plus `id`), weil `fetchAllPages` sonst ueber
 * Seitengrenzen hinweg Zeilen doppelt oder gar nicht sehen kann.
 */
export async function fetchSecuritySnapshots(): Promise<SecuritySnapshot[]> {
  const rows = await fetchAllPages<SecuritySnapshot>((from, to) =>
    supabase
      .from("security_snapshots")
      .select("*")
      .order("as_of", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return rows.map(normalizeNumericFields);
}

/** Die Uploads, juengster zuerst — Grundlage der Standsverwaltung. */
export async function fetchSnapshotRuns(): Promise<SecuritySnapshotRun[]> {
  const { data, error } = await supabase
    .from("security_snapshot_runs")
    .select("*")
    .order("as_of", { ascending: false });
  if (error) throw error;
  return data;
}

export interface SnapshotImportInput {
  asOf: string;
  fileName: string | null;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsInvalid: number;
  /** Zeilen ohne `run_id`/`as_of` — beide setzt diese Funktion. */
  snapshots: Omit<SecuritySnapshotInsert, "run_id" | "as_of">[];
}

/**
 * Schreibt einen Depotstand.
 *
 * **Ein Stichtag wird als Ganzes ersetzt**: Ein vorhandener Lauf desselben
 * Tages wird zuerst geloescht, wodurch seine Zeilen kaskadierend verschwinden.
 * Ein zweiter Upload derselben Datei verdoppelt damit nichts, und ein
 * korrigierter Export ueberschreibt den fehlerhaften vollstaendig — statt
 * Zeilen zurueckzulassen, die in keiner Datei je standen.
 *
 * Die Reihenfolge ist bewusst loeschen → Lauf → Zeilen: PostgREST kennt keine
 * Transaktion ueber mehrere Anfragen. Bricht der Vorgang nach dem Lauf ab,
 * bleibt ein Lauf ohne Zeilen zurueck — sichtbar in der Standsverwaltung und
 * dort mit einem Griff zu entfernen. Die umgekehrte Reihenfolge waere nicht
 * moeglich: Zeilen brauchen den Lauf als Fremdschluessel.
 */
export async function importSnapshotRun(
  input: SnapshotImportInput,
): Promise<SecuritySnapshotRun> {
  await deleteSnapshotRun(input.asOf);

  const { data: run, error: runError } = await supabase
    .from("security_snapshot_runs")
    .insert({
      as_of: input.asOf,
      source: SNAPSHOT_SOURCE,
      file_name: input.fileName,
      rows_total: input.rowsTotal,
      rows_imported: input.rowsImported,
      rows_skipped: input.rowsSkipped,
      rows_invalid: input.rowsInvalid,
    })
    .select()
    .single();
  if (runError) throw runError;

  if (input.snapshots.length > 0) {
    const { error } = await supabase.from("security_snapshots").insert(
      input.snapshots.map((snapshot) => ({
        ...snapshot,
        run_id: run.id,
        as_of: input.asOf,
      })),
    );
    if (error) throw error;
  }

  return run;
}

/**
 * Entfernt einen Stand vollstaendig. Die Snapshot-Zeilen gehen ueber den
 * Fremdschluessel mit (`on delete cascade`), sodass kein halber Stichtag
 * zurueckbleiben kann.
 */
export async function deleteSnapshotRun(asOf: string): Promise<void> {
  const { error } = await supabase
    .from("security_snapshot_runs")
    .delete()
    .eq("source", SNAPSHOT_SOURCE)
    .eq("as_of", asOf);
  if (error) throw error;
}
