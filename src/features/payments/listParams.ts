/**
 * Reine Parse-/Serialisierungslogik für den URL-Zustand der Verwaltungsliste
 * (Phase 6 §2/§4): Sortierung, Statusfilter und Seite. Ungültige Parameter fallen
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

/**
 * Ob der Statusfilter stornierte Zeilen einschliesst. Geladen werden sie
 * immer (ein Abruf fuer alle Filter); der Filter entscheidet, ob sie in
 * Jahresauswahl und Leerzustand zaehlen.
 */
export function statusNeedsArchived(status: StatusFilter): boolean {
  return status !== "active";
}

/**
 * Seite der Liste (`?page=`), 1-basiert. Sie steht in der Adresse, damit der
 * Weg zurück von einem Eingang auf derselben Seite endet — als lokaler Zustand
 * fiel sie beim Verlassen der Liste auf 1 zurück, während die Bildlaufposition
 * die der verlassenen Seite blieb. Eine Seite jenseits des Endes begrenzt die
 * Liste selbst; hier zählt nur, dass es eine ganze Zahl ab 1 ist.
 */
export function parsePage(value: string | null): number {
  if (!value || !/^[1-9]\d{0,5}$/.test(value)) return 1;
  return Number.parseInt(value, 10);
}
