/**
 * Reine Parse-/Serialisierungslogik für den URL-Zustand der Verwaltungsliste
 * (Phase 6 §2/§4): Sortierung und Statusfilter. Ungültige Parameter fallen
 * sicher auf den jeweiligen Standard zurück (§4).
 */

export type StatusFilter = "active" | "cancelled" | "all";
export type SortField = "payment_date" | "amount" | "company" | "depot" | "updated";
export type SortDirection = "asc" | "desc";

export interface ListSort {
  field: SortField;
  direction: SortDirection;
}

const STATUS_VALUES: readonly StatusFilter[] = ["active", "cancelled", "all"];
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

export function parseSort(sort: string | null, direction: string | null): ListSort {
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
