import type { PaymentSource } from "@/lib/supabase/database.types";

/**
 * Reine Parse-/Serialisierungslogik für den URL-Zustand der Verwaltungsliste
 * (Phase 6 §2/§4): Sortierung, Statusfilter und Datenquellenfilter. Ungültige
 * Parameter fallen sicher auf den jeweiligen Standard zurück (§4).
 */

export type StatusFilter = "active" | "cancelled" | "all";
export type SourceFilter = "all" | PaymentSource;
export type SortField = "payment_date" | "amount" | "company" | "depot" | "updated";
export type SortDirection = "asc" | "desc";

export interface ListSort {
  field: SortField;
  direction: SortDirection;
}

const STATUS_VALUES: readonly StatusFilter[] = ["active", "cancelled", "all"];
const SOURCE_VALUES: readonly SourceFilter[] = [
  "all",
  "manual",
  "csv_import",
  "excel_import",
  "restore",
];
const SORT_FIELDS: readonly SortField[] = [
  "payment_date",
  "amount",
  "company",
  "depot",
  "updated",
];
const SORT_DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];

export const DEFAULT_SORT: ListSort = { field: "payment_date", direction: "desc" };

export function parseStatus(value: string | null): StatusFilter {
  return STATUS_VALUES.includes(value as StatusFilter)
    ? (value as StatusFilter)
    : "active";
}

export function parseSource(value: string | null): SourceFilter {
  return SOURCE_VALUES.includes(value as SourceFilter)
    ? (value as SourceFilter)
    : "all";
}

export function parseSort(
  sort: string | null,
  direction: string | null,
): ListSort {
  const field = SORT_FIELDS.includes(sort as SortField)
    ? (sort as SortField)
    : DEFAULT_SORT.field;
  const dir = SORT_DIRECTIONS.includes(direction as SortDirection)
    ? (direction as SortDirection)
    : field === "company" || field === "depot"
      ? "asc"
      : "desc";
  return { field, direction: dir };
}

/** Der Statusfilter bestimmt, ob stornierte Zeilen überhaupt geladen werden. */
export function statusNeedsArchived(status: StatusFilter): boolean {
  return status !== "active";
}

/** Bereinigt einen Suchbegriff (§3): Leerraum trimmen, Groß/Klein ignorieren. */
export function normalizeSearch(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}
