import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * Sortierung der Unternehmensliste — dasselbe Muster wie in der
 * Dividendenliste (`payments/sortRows.ts`): rein, stabil und ohne Bezug zur
 * Oberflaeche, damit sie sich einzeln pruefen laesst.
 *
 * **Leere Felder stehen immer am Ende**, in beiden Richtungen: Ein Unternehmen
 * ohne Ticker ist keine Antwort auf „sortiere nach Ticker" — weder die
 * kleinste noch die groesste. Bei Gleichstand entscheidet der Name.
 */
export type SecuritySortField = "name" | "ticker" | "sector" | "country" | "depot";
export type SortDirection = "asc" | "desc";

export interface SecuritySort {
  field: SecuritySortField;
  direction: SortDirection;
}

/** Beschriftungen der Auswahl; sie benennen die Sortierung selbst. */
export const SECURITY_SORT_FIELDS: readonly {
  value: SecuritySortField;
  label: string;
}[] = [
  { value: "name", label: "Nach Name" },
  { value: "ticker", label: "Nach Ticker" },
  { value: "sector", label: "Nach Branche" },
  { value: "country", label: "Nach Land" },
  // „Nach Depot": Die Liste kennt nur ein Depot je Unternehmen — das
  // Standard-Depot —, und „Nach Standard-Depot" fuellte die Auswahl mit einem
  // Wort, das an dieser Stelle nichts unterscheidet.
  { value: "depot", label: "Nach Depot" },
];

export const DEFAULT_SECURITY_SORT: SecuritySort = { field: "name", direction: "asc" };

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "de", { sensitivity: "base" });
}

/**
 * @param depotNameOf Name des Standard-Depots; `null`, wenn keines gesetzt ist.
 */
export function sortSecurities(
  rows: readonly Security[],
  sort: SecuritySort,
  depotNameOf: (security: Security) => string | null,
): Security[] {
  const valueOf = (security: Security): string | null => {
    switch (sort.field) {
      case "ticker":
        return security.ticker;
      case "sector":
        return security.sector;
      case "country":
        return security.country;
      case "depot":
        return depotNameOf(security);
      case "name":
        return security.name;
    }
  };

  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left === null || left === "") {
      if (right !== null && right !== "") return 1;
    } else if (right === null || right === "") {
      return -1;
    } else {
      const primary = compareText(left, right) * factor;
      if (primary !== 0) return primary;
    }
    return compareText(a.name, b.name);
  });
}
