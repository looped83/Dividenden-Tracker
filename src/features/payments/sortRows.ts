import type { Money } from "@/lib/money";
import { compareGermanLoose } from "@/lib/utils/compareText";
import type { ListSort } from "./listParams";

/**
 * Reine, **stabile** Sortierung der gefilterten Verwaltungsliste (§2). Die
 * Standardsortierung (Zahlungsdatum absteigend) bricht Gleichstände über den
 * Erstellungszeitpunkt und zuletzt über die technische ID auf — deterministisch
 * und ohne doppelte/übersprungene Reihenfolge über Reloads hinweg.
 */
export interface SortableRow {
  id: string;
  /** Effektives (angezeigtes) Zahlungsdatum, ISO. */
  effectiveDate: string;
  /** Nettobetrag — einmal beim Aufbau der Zeile geparst, nicht je Vergleich. */
  amount: Money;
  createdAt: string;
  updatedAt: string;
  companyName: string;
  depotName: string;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Fallback-Vergleich für stabile, eindeutige Reihenfolge (§2). */
function tieBreak(a: SortableRow, b: SortableRow): number {
  if (a.effectiveDate !== b.effectiveDate) {
    // Immer Zahlungsdatum absteigend als sekundäres Kriterium.
    return a.effectiveDate < b.effectiveDate ? 1 : -1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return compareStrings(a.id, b.id);
}

export function sortRows<T extends SortableRow>(rows: readonly T[], sort: ListSort): T[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  const copy = [...rows];
  copy.sort((a, b) => {
    let primary = 0;
    switch (sort.field) {
      case "payment_date":
        primary = compareStrings(a.effectiveDate, b.effectiveDate) * factor;
        break;
      case "amount":
        // Ueber den Zahlenwert, nicht `compareTo`: Die Liste fuehrt Depots
        // verschiedener Waehrungen nebeneinander, und `compareTo` wiese einen
        // Vergleich ueber Waehrungen hinweg ab.
        primary = a.amount.toDecimal().comparedTo(b.amount.toDecimal()) * factor;
        break;
      case "company":
        primary = compareGermanLoose(a.companyName, b.companyName) * factor;
        break;
      case "depot":
        primary = compareGermanLoose(a.depotName, b.depotName) * factor;
        break;
      case "updated":
        primary = compareStrings(a.updatedAt, b.updatedAt) * factor;
        break;
    }
    if (primary !== 0) return primary;
    return tieBreak(a, b);
  });
  return copy;
}
